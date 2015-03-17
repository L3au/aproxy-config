var onmessage = function (event) {
    var urls = event.data;
    var mapContents = {};

    function init() {
        Promise.all(urls.map(function (url) {
            return new Promise(function (resolve, reject) {
                var xhr = new XMLHttpRequest();

                xhr.onload = function () {
                    var content = mapContents[url];
                    var lastModified = xhr.getResponseHeader('last-modified');

                    if (lastModified) {
                        if (content) {
                            if (content !== lastModified) {
                                postMessage(url);
                                self.close();
                            }
                        } else {
                            mapContents[url] = lastModified;
                        }
                    }

                    resolve();
                };

                xhr.onerror = function () {
                    resolve();
                };

                xhr.timeout = 3000;
                xhr.open('HEAD', url, true);
                xhr.send();
            });
        })).then(function () {
            timer = setTimeout(init, 750);
        });
    }

    init();
};


