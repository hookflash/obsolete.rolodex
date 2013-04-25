
const PATH = require("path");
const EXPRESS = require("express");
const ROLODEX = require("../");

const PORT = 8080;


exports.main = function(callback) {
    try {
        var app = EXPRESS();

        app.use(EXPRESS.logger());
        app.use(EXPRESS.cookieParser());
        app.use(EXPRESS.bodyParser());
        app.use(EXPRESS.session({ secret: "session secret" }));

		// NOTE: You can also pass the configuration as an object (instead of specifying the filepath)
		// NOTE: If you want more control over how `ROLODEX` registers itself, see the `ROLODEX.hook()` implementation.
        ROLODEX.hook(app, PATH.join(__dirname, "rolodex.config.json"), {
        	hostname: "localhost",
        	port: PORT
        });

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


if (require.main === module) {
    exports.main(function(err) {
        if (err) {
            console.error(err.stack);
            process.exit(1);
        }
    });
}
