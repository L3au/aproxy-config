var ConfigPort = 'http://127.0.0.1:9999';

function getOptions(request) {
    var options = JSON.parse(localStorage.options);

    if (!request) {
        return options;
    }

    return new Promise(function (resolve) {
        getRules().then(function (rules) {
            options.proxyRules = rules;
            resolve(options);
        });
    });
}

function setOptions(options) {
    localStorage.options = JSON.stringify(options);

    var rules = options.proxyRules;
    var api = ConfigPort + '/rule';
    var xhr = new XMLHttpRequest();

    rules = encodeURIComponent(JSON.stringify(rules));

    xhr.onload = function () {
        var json = JSON.parse(xhr.responseText);

        if (json.success) {
            setProxy(true);
        }
    };

    xhr.onerror = function () {
        chrome.notifications.create({
            type: 'basic',
            title: '额...',
            message: '保存规则出了点问题，可能aproxy没启动',
            iconUrl: 'icon/icon_128.png',
            appIconMaskUrl: 'icon/icon_128.png',
            contextMessage: 'Aproxy Config'
        }, function () {
            clearProxy();
        });
    };

    xhr.open('POST', api);
    xhr.send('rules=' + rules);
}

function getRules() {
    return new Promise(function (resolve) {
        var api = ConfigPort + '/rule';
        var xhr = new XMLHttpRequest();

        xhr.onload = function () {
            var rules = JSON.parse(xhr.responseText);
            var options = getOptions();

            options.proxyRules = rules;

            localStorage.options = JSON.stringify(options);

            setProxy();
            resolve(rules);
        };

        xhr.onerror = function () {
            chrome.notifications.create({
                type: 'basic',
                title: '额...',
                message: 'aproxy没启动或使用的不是默认端口',
                iconUrl: 'icon/icon_128.png',
                appIconMaskUrl: 'icon/icon_128.png',
                contextMessage: 'Aproxy Config'
            }, function () {
                clearProxy();
            });
        };

        xhr.open('GET', api);
        xhr.send();
    });
}

function clearProxy() {
    chrome.proxy.settings.clear({
        scope: 'regular'
    });
    chrome.browserAction.setIcon({
        path: {
            "19": "icon/icon_disabled.png",
            "38": "icon/icon_disabled.png"
        }
    });
}

function FindProxyForURL(url, host) {
    var isMatched;
    var proxy = 'DIRECT';
    var path = url.slice(url.indexOf(host) + host.length);

    path = path.replace('??', '');

    for (var i = 0; i < rules.length; i++) {
        var regex = rules[i];

        if (regex.test(path)) {
            proxy = 'PROXY 127.0.0.1:9998';
            break;
        }
    }

    return proxy;
}

function setProxy() {
    var options = getOptions();
    var rules = options.proxyRules;
    var pacRule = FindProxyForURL.toString();

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

    chrome.proxy.settings.set({
        value: {
            mode: 'pac_script',
            pacScript: {
                data: pacRule
            }
        }, scope: 'regular'
    });

    chrome.browserAction.setIcon({
        path: {
            "19": "icon/icon_48.png",
            "38": "icon/icon_128.png"
        }
    });
}

var cacheWorkers = {};

if (!localStorage.options) {
    localStorage.options = JSON.stringify({
        autoRefresh: false,
        refreshList: []
    });
}

function clearWorker(tabId) {
    var worker = cacheWorkers[tabId];

    if (worker) {
        worker.terminate();
        worker = null;
        delete cacheWorkers[tabId];
    }
}

function clearAllWorkers() {
    for (var tabId in cacheWorkers) {
        clearWorker(tabId);
    }
}

function statusWatcher() {
    var xhr = new XMLHttpRequest();

    xhr.open('HEAD', ConfigPort);

    xhr.onload = function () {
        setProxy();
    };
    xhr.onerror = function () {
        clearProxy();
    };

    xhr.send();
}

chrome.proxy.onProxyError.addListener(function (details) {
    console.error(details);
    clearProxy();
});

chrome.tabs.onActivated.addListener(statusWatcher);
chrome.webRequest.onBeforeRequest.addListener(statusWatcher, {
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
            clearAllWorkers();
        }
    }
});

chrome.tabs.onRemoved.addListener(function (tabId, removeInfo) {
    clearWorker(tabId);
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    var action = request.action;
    var tabId = sender.tab.id;
    var assets = request.assets;

    if (action == 'watch') {
        var worker = new Worker('worker.js');

        cacheWorkers[tabId] = worker;

        worker.onmessage = function (event) {
            var url = event.data;
            var isCSS = /\.css(?:[\?#]|$)/i.test(url);

            clearWorker(tabId);

            chrome.tabs.sendMessage(tabId, {
                url: url,
                isCSS: isCSS,
                action: 'refresh'
            });
        };

        worker.postMessage(assets);
    }
});


//chrome.webRequest.onHeadersReceived.addListener(function (request) {
//    var headers = request.responseHeaders;
//
//    headers.some(function (header, index) {
//        if (header.name.toLowerCase() == 'content-type') {
//            headers.splice(index, 1);
//            return true;
//        }
//    });
//
//    headers.push({
//        name: 'content-security-policy',
//        value: "default-src *; script-src 'unsafe-inline' 'unsafe-eval' g.tbcdn.cn; style-src 'unsafe-inline'"
//    });
//
//    return {
//        responseHeaders: headers
//    };
//}, {
//    urls: ['*://127.0.0.1/*'],
//    types: ['main_frame']
//}, ['blocking', 'responseHeaders']);
