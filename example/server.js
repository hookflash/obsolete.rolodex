
const PATH = require("path");
const FS = require("fs-extra");
const EXPRESS = require("express");
const EXPRESS_SESSION = require("express-session");
const MORGAN = require("morgan");
const CONNECT_MEMCACHED = require("connect-memcached");
const ROLODEX = require("../");

const PORT = process.env.PORT || 8080;


var config = null;
if (FS.existsSync(PATH.join(__dirname, "../../.pio.json"))) {
    config = JSON.parse(FS.readFileSync(PATH.join(__dirname, "../../.pio.json")));
}

exports.main = function(callback) {
    try {
        var app = EXPRESS();

        app.use(MORGAN());
        app.use(EXPRESS.cookieParser());
        app.use(EXPRESS.bodyParser());

        var path = null;
        if (config && config.config && config.config["rolodex.config.json"]) {
            path = config.config["rolodex.config.json"];

            if (
                config.config["rolodex.config.json"].db &&
                config.config["rolodex.config.json"].db.memcached
            ) {
                var sessionStore = new (CONNECT_MEMCACHED(EXPRESS_SESSION))({
                    prefix: "rolodex-",
                    hosts: [
                        config.config["rolodex.config.json"].db.memcached.host + ":" + config.config["rolodex.config.json"].db.memcached.port
                    ]
                });
                app.use(EXPRESS_SESSION({
                    secret: 'session secret',
                    key: 'sid-' + PORT,
                    proxy: 'true',
                    store: sessionStore
                }));
                if (!app.helpers) {
                    app.helpers = {};
                }
            }

        } else {
            path = PATH.join(__dirname, "../../..", "rolodex.config.local.json");
            if (!FS.existsSync(path)) {
                path = PATH.join(__dirname, "rolodex.config.json");
            }

            app.use(EXPRESS.session({ secret: "session secret" }));
        }
		// NOTE: You can also pass the configuration as an object (instead of specifying the filepath)
		// NOTE: If you want more control over how `ROLODEX` registers itself, see the `ROLODEX.hook()` implementation.
        return ROLODEX.hook(app, path, {
        	hostname: (config && config.config.pio.hostname) || "localhost",
        	port: PORT,
            debug: true
        }, function(err) {
            if (err) return callback(err);

            app.use(EXPRESS.static(PATH.join(__dirname, "ui")));

            var server = app.listen(PORT);

            console.log("open http://0.0.0.0:" + PORT + "/");

            return callback(null, {
                server: server,
                port: PORT
            });
        });

    } catch(err) {
        return callback(err);
    }
}


if (require.main === module) {
    exports.main(function(err) {
        if (err) {
            console.error(err.stack);
            process.exit(1);
        }
    });
}

