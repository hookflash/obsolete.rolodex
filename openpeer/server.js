
const PATH = require("path");
const FS = require("fs");
const EXPRESS = require("express");
const ROLODEX = require("../");

const PORT = process.env.PORT || 8080;


exports.main = function(options, callback) {
    try {
        var app = EXPRESS();

        //app.use(EXPRESS.logger());
        app.use(EXPRESS.cookieParser());
        app.use(EXPRESS.bodyParser());

        var path = PATH.join(__dirname, "rolodex.config.local.json");
        if (!FS.existsSync(path)) {
            path = PATH.join(__dirname, "rolodex.config.json");
        }

        return ROLODEX.hook(app, path, {
        	hostname: "localhost",
        	port: PORT,
            debug: true,
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
