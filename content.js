(function () {
    var rootEl = document.documentElement;

    function $$(v, c) {
        return [].slice.call((c || document).querySelectorAll(v));
    }

    function getScripts() {
        var scripts = $$('script[src]');

        return scripts.map(function (script) {
            return script.src
        });
    }

    function getStyleLinks() {
        var links = $$('link[href][rel="stylesheet"]');

        return links.map(function (link) {
            return link.href;
        });
    }

    function onLoaded(){
        var assets = [];

        var url = new URL(location.href);
        
        if (url.pathname.slice(-5) === '.html') {
            assets.push(location.href);
        }

        assets = assets.concat(getScripts()).concat(getStyleLinks());

        chrome.runtime.sendMessage({
            action: 'watch',
            assets: assets
        });
    }

    chrome.runtime.onMessage.addListener(function (request) {
        var action = request.action;
        var url = request.url;
        var isCSS = request.isCSS;

        if (action == 'collect') {
            if (document.readyState == 'complete') {
                onLoaded();
            } else {
                window.onload = onLoaded;
            }
        }

        if (action == 'refresh') {
            location.reload();
            //if (isCSS) {
            //    var newLink;
            //    var links = $$('link[href][rel="stylesheet"]');
            //
            //    links.some(function (link) {
            //        if (link.href == url) {
            //            newLink = link;
            //        }
            //    });
            //
            //    newLink.href = url;
            //
            //    rootEl.style.opacity = 0.9999 + Math.random();
            //}
        }
    });
}).call();
