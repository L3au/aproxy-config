(function () {
    var options, timer;
    var form = $('form');
    var template = tplEngine($('#template').html());
    var background = chrome.extension.getBackgroundPage();

    function getOptions() {
        return form.serializeJSON();
    }

    $.extend($.serializeJSON.defaultOptions, {
        parseAll: true,
        checkboxUncheckedValue: 'false',
        useIntKeysAsArrayIndex: true,
        parseWithFunction: function (val, name) {
            return val;
        }
    });

    background.getOptions(true).then(function (data) {
        options = $.extend(true, {}, data);

        if (options.proxyRules.length == 0) {
            options.proxyRules.push({});
        }

        if (options.refreshList.length == 0) {
            options.refreshList.push('');
        }

        updateView();

        $('html').addClass('popup-show');
    });


    var EVENTS = {
        // form submit
        '': {
            'submit': function (e) {
                e.preventDefault();

                options = getOptions();

                if (!filterOptions()) {
                    return;
                }

                background.setOptions(options);

                window.close();
            }
        },

        // enable or disable proxy
        '.proxy-enabled': {
            'switchChange.bootstrapSwitch': function (event, state) {
                clearTimeout(timer);

                options = getOptions();

                timer = setTimeout(function () {
                    options.enabled = state;
                    updateView();
                }, 250);
            }
        },

        // enable/disable rule item
        '.fui-eye': {
            click: function (e) {
                var target = $(e.currentTarget);
                var item = target.parent();
                var isDisabled = !item.hasClass('rule-item-disabled');
                var index = parseInt(target.attr('data-index'), 10);

                options = getOptions();

                var rules = options.proxyRules;

                rules[index].disabled = isDisabled;

                item.find('.hidden').val(isDisabled);
                item.toggleClass('rule-item-disabled');
            }
        },

        // add rule item
        '.fui-plus': {
            click: function (e) {
                var target = $(e.currentTarget);
                var type = target.attr('data-type');

                options = getOptions();

                var proxyRules = options.proxyRules;
                var refreshList = options.refreshList;

                switch (type) {
                    case 'proxy':
                        proxyRules.push({});
                        break;
                    case 'refresh':
                        refreshList.push('');
                        break;
                    default:
                        break;
                }

                updateView();
            }
        },

        // delete rule item
        '.fui-cross': {
            click: function (e) {
                var target = $(e.currentTarget);
                var type = target.attr('data-type');
                var index = parseInt(target.attr('data-index'), 10);

                options = getOptions();

                var proxyRules = options.proxyRules;
                var refreshList = options.refreshList;

                switch (type) {
                    case 'proxy':
                        proxyRules.splice(index, 1);
                        break;
                    case 'refresh':
                        refreshList.splice(index, 1);
                        break;
                    default:
                        break;
                }

                updateView();
            }
        },

        // change autoRefresh option
        '.refresh-check': {
            'switchChange.bootstrapSwitch': function (event, state) {
                clearTimeout(timer);

                options = getOptions();

                timer = setTimeout(function () {
                    options.autoRefresh = state;
                    updateView();
                }, 250);
            }
        }
    };

    $.each(EVENTS, function (selector, events) {
        $.each(events, function (type, handler) {
            form.on(type, selector, handler);
        });
    });

    function filterOptions() {
        var refreshList = options.refreshList;

        refreshList = refreshList.filter(function (item) {
            return !!item.trim();
        });

        options.refreshList = refreshList;

        var isRejected;
        var proxyRules = options.proxyRules;
        var filterRules = [];

        for (var i = 0; i < proxyRules.length; i++) {
            var isValid = true;
            var rule = proxyRules[i];

            rule.group = rule.group.trim();
            rule.project = rule.project.trim();
            rule.path = rule.path.trim();

            var ruleArray = [rule.group, rule.project, rule.path];

            if (ruleArray.join() == ',,') {
                continue;
            }

            var group = $('.rule-item:eq(' + i + ') .group');

            if (rule.group == '') {
                group.addClass('form-control-error');
                isValid = false;
            } else {
                group.removeClass('form-control-error');
            }

            var project = $('.rule-item:eq(' + i + ') .project');

            if (rule.project == '') {
                project.addClass('form-control-error');
                isValid = false;
            } else {
                project.removeClass('form-control-error');
            }

            var path = $('.rule-item:eq(' + i + ') .path');

            if (rule.path == '') {
                path.addClass('form-control-error');
                isValid = false;
            } else {
                path.removeClass('form-control-error');
            }

            filterRules.push(rule);

            if (!isValid) {
                isRejected = true;
            }
        }

        options.proxyRules = filterRules;

        return !isRejected;
    }

    function updateView() {
        form.html(template.render(options));

        $('[data-toggle="switch"]').bootstrapSwitch();
        $('[data-toggle="radio"]').radiocheck();
    }

    function tplEngine(str) {
        var strFunc = "var out = ''; out+=" + "'" +
            str.replace(/[\r\t\n]/g, " ")
                .replace(/'(?=[^}]*}})/g, "\t")
                .split("'").join("\\'")
                .split("\t").join("'")
                .replace(/{{=(.+?)}}/g, "'; out += $1; out += '")
                .split("{{").join("';")
                .split("}}").join("out+='") + "'; return out;";

        var fn = new Function("it", strFunc);

        return {
            render: function (data) {
                return fn(data || {});
            }
        }
    }
}).call();
