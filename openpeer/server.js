
const PATH = require("path");
const FS = require("fs");
const EXPRESS = require("express");
const ROLODEX = require("../");

const PORT = process.env.PORT || 8080;


var config = null;
var serviceUid = false;
if (FS.existsSync(PATH.join(__dirname, "../service.json"))) {
    config = JSON.parse(FS.readFileSync(PATH.join(__dirname, "../service.json")));
    serviceUid = config.uid;
} else
if (FS.existsSync(PATH.join(__dirname, "../../.pio.json"))) {
    config = JSON.parse(FS.readFileSync(PATH.join(__dirname, "../../.pio.json")));
}

exports.main = function(options, callback) {
    try {
        var app = EXPRESS();

        app.use(function(req, res, next) {
            if (serviceUid) {
                res.setHeader("x-service-uid", serviceUid);
            }
            if (req.url === "/") {
                return res.end();
            }
            return next();
        });

        app.use(EXPRESS.logger());
        app.use(EXPRESS.cookieParser());
        app.use(EXPRESS.bodyParser());

        var path = null;
        if (config && config.config && config.config["rolodex.config.json"]) {
            path = config.config["rolodex.config.json"];
        } else {
            path = PATH.join(__dirname, "rolodex.config.local.json");
            if (!FS.existsSync(path)) {
                path = PATH.join(__dirname, "rolodex.config.json");
            }
        }

        console.log("use config", path);

        return ROLODEX.hook(app, path, {
        	hostname: "localhost",
        	port: PORT,
            debug: false,
            test: options.test || false
        }, function(err) {
            if (err) return callback(err);

            var server = app.listen(PORT);

            console.log("open http://localhost:" + PORT + "/");

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
    exports.main({}, function(err) {
        if (err) {
            console.error(err.stack);
            process.exit(1);
        }
    });
}
