var ConfigPort = 'http://127.0.0.1:9999/';

chrome.proxy.onProxyError.addListener(function (details) {
    console.error(details);
    chrome.proxy.settings.clear();
});

function isEmpty(o) {
    return Object.keys(o).length == 0;
}

function getOptions(request) {
    if (!request) {
        return JSON.parse(localStorage.options);
    }

    var options = JSON.parse(localStorage.options);

    return new Promise(function (resolve, reject) {
        getRules().then(function (rules) {
            options.proxyRules = rules;
            resolve(options);
        });
    });
}

function setOptions(options) {
    chrome.storage.local.set(options);
    localStorage.options = JSON.stringify(options);

    setIcon(options);

    var rules = options.proxyRules;

    rules = rules.filter(function (rule) {
        return rule.group && rule.project && rule.path;
    });

    rules = rules.map(function (rule) {
        return {
            name: rule.project,
            from: '/' + rule.group + '/' + rule.project + '/*',
            to: rule.path,
            disabled: rule.disabled
        }
    });

    var api = ConfigPort + 'rule/save';
    var xhr = new XMLHttpRequest();

    api += '?rules=' + encodeURIComponent(JSON.stringify(rules));
    api += '&t=' + Date.now();

    xhr.onload = function () {
        // reset proxy setting
        setProxy(options);

        chrome.tabs.reload({
            bypassCache: true
        });
    };

    xhr.open('GET', api);
    xhr.send();
}

function getRules() {
    function showTip () {
        var note = new Notification('额...', {
            body: 'Aproxy没有启动或者没使用默认端口',
            icon: chrome.runtime.getURL('icon/icon_128.png')
        });

        note.onclick = function () {
            note.close();
        };

        setTimeout(function () {
            note.close();
        }, 7000);
    }

    return new Promise(function (resolve, reject) {
        var api = ConfigPort + 'rule/load';

        var xhr = new XMLHttpRequest();

        xhr.onload = function () {
            var result = JSON.parse(xhr.responseText);
            var rules = result.rules || [];

            rules = rules.map(function (rule) {
                var to = rule.to;
                var from = rule.from;
                var disabled = rule.disabled;

                var match = from.match(/([\w-]+)/g);

                if (match && match.length >= 2) {
                    return {
                        disabled: disabled,
                        group: match[0],
                        project: match[1],
                        path: to
                    }
                }

                return {};
            });

            resolve(rules);
        };

        xhr.onerror = function () {
            if (Notification.permission === "granted") {
                showTip();
            } else if (Notification.permission !== 'denied') {
                Notification.requestPermission(function (permission) {
                    if (permission === "granted") {
                        showTip();
                    }
                });
            }

            var options = JSON.parse(localStorage.options || '{}');

            resolve(options.proxyRules || []);
        };

        xhr.open('GET', api, true);
        xhr.send();
    });
}

function setIcon(options) {
    if (options.enabled || options.disabledCache || options.autoRefresh) {
        chrome.browserAction.setIcon({
            path: {
                "19": "icon/icon_48.png",
                "38": "icon/icon_128.png"
            }
        });

        var badgeText = '';

        if (options.enabled) {
            badgeText += 'P';
        }

        if (options.disabledCache) {
            badgeText += 'C';
        }

        if (options.autoRefresh) {
            badgeText += 'R';
        }

        chrome.browserAction.setBadgeText({text: badgeText});
        chrome.browserAction.setBadgeBackgroundColor({color: '#fd5e2d'});
    } else {
        chrome.browserAction.setIcon({
            path: {
                "19": "icon/icon_disabled.png",
                "38": "icon/icon_disabled.png"
            }
        });

        chrome.browserAction.setBadgeText({text: ''});
        chrome.browserAction.setBadgeBackgroundColor({color: [0, 0, 0, 0]})
    }
}

function setProxy(options) {
    var rules = options.proxyRules;

    var pacRule = (function () {/*
         function FindProxyForURL(url, host) {
             var isMatched;
             var path = url.slice(url.indexOf(host) + host.length);

             path = path.replace('??', '');

             for (var i = 0; i < rules.length; i++) {
                var regex = rules[i];

                 if (regex.test(path)) {
                    return 'PROXY 127.0.0.1:9998';
                 }
             }

             return 'DIRECT';
         }
     */}).toString().slice(15, -5);

    rules = rules.filter(function (rule) {
        return !rule.disabled;
    });

    rules = rules.map(function (rule) {
        var group = rule.group;
        var project = rule.project;
        var version = '/\\d+\\.\\d+\\.\\d+/';

        var regex = '/' + group + '/' + project + version;

        return new RegExp(regex);
    });

    pacRule = 'var rules= [' + rules.toString() + '];\n' + pacRule;

    if (options.enabled) {
        chrome.proxy.settings.set({
            value: {
                mode: 'pac_script',
                pacScript: {
                    data: pacRule
                }
            }, scope: 'regular'
        });
    } else {
        chrome.proxy.settings.clear({
            scope: 'regular'
        });
    }
}

var app = (function () {
    function Background() {
        this.initialize();
    }

    Background.prototype = {
        constructor: Background,

        cacheWorkers: {},

        initialize: function () {
            this.initOptions();
            this.bindEvents();
        },

        initOptions: function () {
            getRules().then(function (rules) {
                chrome.storage.local.get(function (options) {
                    if (options.localRules || options.target) {
                        chrome.storage.local.clear();
                    }
                    
                    if (isEmpty(options)) {
                        options = {
                            enabled: false,
                            autoRefresh: false,
                            refreshList: [],
                            disabledCache: false
                        };
                    }

                    options.proxyRules = rules;

                    chrome.storage.local.set(options);
                    localStorage.options = JSON.stringify(options);

                    setProxy(options);
                    setIcon(options);
                });
            });
        },

        bindEvents: function () {
            var self = this;

            var isClearing;

            function clearCache() {
                var options = getOptions();

                if (options.disabledCache && !isClearing) {
                    var oneWeekTime = 1000 * 60 * 60 * 24 * 7;
                    var since = Date.now() - oneWeekTime;

                    isClearing = true;

                    chrome.browsingData.removeCache({
                        since: since
                    }, function () {
                        isClearing = false;
                    });
                }
            }

            // clear browsing cache
            chrome.webRequest.onBeforeRequest.addListener(function () {
                clearCache();
            }, {
                urls: ['<all_urls>'],
                types: ['main_frame']
            });

            // watch auto refresh
            chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
                self.clearWorker(tabId);

                if (changeInfo.status == 'complete') {
                    var options = getOptions();
                    var list = options.refreshList;

                    if (options.autoRefresh && list != '') {
                        var url = new URL(tab.url);

                        var isMatched = list.some(function (rUrl) {
                            rUrl = new URL(rUrl);

                            if (rUrl.origin == url.origin && rUrl.pathname == url.pathname) {
                                return true;
                            }
                        });

                        if (isMatched) {
                            chrome.tabs.sendMessage(tabId, {
                                action: 'collect'
                            });
                        }
                    } else {
                        self.clearAllWorkers();
                    }
                }
            });

            chrome.tabs.onRemoved.addListener(function (tabId, removeInfo) {
                self.clearWorker(tabId);
            });

            chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
                var action = request.action;
                var tabId = sender.tab.id;
                var workers = self.cacheWorkers;
                var assets = request.assets;

                if (action == 'watch') {
                    var worker = new Worker('worker.js');

                    workers[tabId] = worker;

                    worker.onmessage = function (event) {
                        var url = event.data;
                        var isCSS = /\.css(?:[\?#]|$)/i.test(url);

                        self.clearWorker(tabId);

                        chrome.tabs.sendMessage(tabId, {
                            url: url,
                            isCSS: isCSS,
                            action: 'refresh'
                        });
                    };

                    worker.postMessage(assets);
                }
            });
        },

        clearWorker: function (tabId) {
            var workers = this.cacheWorkers;
            var worker = workers[tabId];

            if (worker) {
                worker.terminate();
                worker = null;
                delete workers[tabId];
            }
        },

        clearAllWorkers: function () {
            var workers = this.cacheWorkers;

            for (var tabId in workers) {
                this.clearWorker(tabId);
            }
        }
    };

    return new Background;
}).call();
