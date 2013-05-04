
const PATH = require("path");
const FS = require("fs-extra");
const EXPRESS = require("express");
const ROLODEX = require("../");

const PORT = 8080;


exports.main = function(callback) {
    try {
        var app = EXPRESS();

        //app.use(EXPRESS.logger());
        app.use(EXPRESS.cookieParser());
        app.use(EXPRESS.bodyParser());
        app.use(EXPRESS.session({ secret: "session secret" }));

        var path = PATH.join(__dirname, "../../..", "rolodex.config.local.json");
        if (!FS.existsSync(path)) {
            path = PATH.join(__dirname, "rolodex.config.json");
        }
		// NOTE: You can also pass the configuration as an object (instead of specifying the filepath)
		// NOTE: If you want more control over how `ROLODEX` registers itself, see the `ROLODEX.hook()` implementation.
        ROLODEX.hook(app, path, {
        	hostname: "localhost",
        	port: PORT,
            debug: true
        });

        mountStaticDir(app, /^\/rolodex\/(rolodex\.client\.js)$/, PATH.join(__dirname, "../lib"));

        app.use(EXPRESS.static(PATH.join(__dirname, "ui")));

        var server = app.listen(PORT);

	    console.log("open http://localhost:" + PORT + "/");

        return callback(null, {
            server: server,
            port: PORT
        });
    } catch(err) {
        return callback(err);
    }
}


function mountStaticDir(app, route, path) {
    app.get(route, function(req, res, next) {
        var originalUrl = req.url;
        req.url = req.params[0];
        EXPRESS.static(path)(req, res, function() {
            req.url = originalUrl;
            return next.apply(null, arguments);
        });
    });
};


if (require.main === module) {
    exports.main(function(err) {
        if (err) {
            console.error(err.stack);
            process.exit(1);
        }
    });
}
