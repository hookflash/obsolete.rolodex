
const ASSERT = require("assert");
const PATH = require("path");
const FS = require("fs");
const EVENTS = require("events");
const URL = require("url");
const WAITFOR = require("waitfor");
const DEEPMERGE = require("deepmerge");
const ESCAPE_REGEXP = require("escape-regexp-component");
const SPAWN = require("child_process").spawn;
const PASSPORT = require("passport");
const REDIS = require("redis");
const KICKQ = require("kickq");
const CONNECT = require("connect");
const CONTACTS = require("./contacts");
const SERVICES = require("./services");


var passport = new PASSPORT.Passport();

passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(obj, done) {
    done(null, obj);
});


exports.hook = function(app, config, options, callback) {
    app.use(passport.initialize());
    app.use(passport.session());
    var rolodex = new Rolodex(config, options);
    rolodex.registerRoutes(app);
    return rolodex.init(function(err) {
    	if (err) return callback(err);
	    return callback(null, rolodex);
    });
}


function Rolodex(config, options) {
	var self = this;

	self.options = null;
	self.logger = null;

	self.config = null;
	self.provisionedServices = {};
	self.ready = false;
	self.routes = {};
	self.db = null;
	self.kickq = null;

	self.services = null;
	self.contacts = null;

	try {

		ASSERT.equal(typeof options, "object");

		self.options = options;

		ASSERT.equal(typeof options.hostname, "string");

		options.debug = options.debug || false;

		if (!options.logger) {
			options.logger = {
				debug: function() {
					if (!options.debug) return;
					return console.log.apply(null, arguments);
				},
				info: console.info.bind(null),
				warn: console.warn.bind(null),
				error: console.error.bind(null)
			}
		}
		self.logger = options.logger;

		if (typeof config === "string") {
			try {
				var path = config;
				config = JSON.parse(FS.readFileSync(path));
			} catch(err) {
				throw new Error("Error '" + err.message + "' while loading config JSON from file '" + path + "'");
			}
		}
		ASSERT.equal(typeof config, "object");

		ASSERT.equal(typeof config.db, "object");
		ASSERT.equal(typeof config.db.redis, "object");
		ASSERT.equal(typeof config.db.redis.host, "string");
		ASSERT.equal(typeof config.db.redis.port, "number");
		config.db.redis = DEEPMERGE({
			"password": "",
            "prefix": "rolodex:"
		}, config.db.redis);
		ASSERT.equal(typeof config.db.redis.password, "string");

		config.db.redis.prefix = config.db.redis.prefix + self.options.hostname + ":";

		config.routes = DEEPMERGE({
            client: "/.openpeer-rolodex/client",
			auth: "/.openpeer-rolodex/auth",
			authCallback: "/.openpeer-rolodex/callback",
			logout: "/.openpeer-rolodex/logout",
			refetch: "/.openpeer-rolodex/refetch",
			services: "/.openpeer-rolodex/services",
			contacts: "/.openpeer-rolodex/contacts"
		}, config.routes || {});

		if (!config.services || !Array.isArray(config.services) || config.services.length === 0) {
			throw new Error("No `config.services = [ ... ]` configured.");
		}

		self.config = config;

		for (var routeName in config.routes) {
			var route = "^" + ESCAPE_REGEXP(config.routes[routeName]);
			if (routeName === "auth" || routeName === "authCallback" || routeName === "refetch" || routeName === "logout" || routeName === "client") {
				route += "\\/(.*)";
			} else
			if (routeName === "contacts") {
				route += "(\\/.*)?";
			}
			self.routes[routeName] = new RegExp(route + "$");
		}
	} catch(err) {
		self.logger.error("config", config);
		throw err;
	}
}

Rolodex.prototype = Object.create(EVENTS.EventEmitter.prototype);

Rolodex.prototype.init = function(callback) {
	var self = this;

	function ensureProvisioned(callback) {
		var waitfor = WAITFOR.serial(callback);
		self.config.services.forEach(function(serviceConfig) {
			return waitfor(function(done) {
				try {
					ASSERT.equal(typeof serviceConfig, "object");
					ASSERT.equal(typeof serviceConfig.name, "string");
					var pluginDescriptorPath = PATH.join(__dirname, "services", serviceConfig.name, "package.json");
					if (!FS.existsSync(pluginDescriptorPath)) {
						throw new Error("No plugin found for `serviceConfig.name` '" + serviceConfig.name + "' at '" + PATH.dirname(pluginDescriptorPath) + "'");
					}
					ASSERT.equal(typeof serviceConfig.passport, "object");
					return ensurePluginDependenciesInstalled(PATH.dirname(pluginDescriptorPath), self.options, function(err) {
						if (err) return done(err);
						return require(PATH.dirname(pluginDescriptorPath)).init(self, passport, {
							passport: serviceConfig.passport,
							callbackURL: [
								(self.options.port === 443) ? "https" : "http",
								"://",
								self.options.hostname,
								(self.options.port && self.options.port !== 443 && self.options.port !== 80) ? ":" + self.options.port : "",
								self.config.routes.authCallback,
								"/",
								serviceConfig.name
							].join("")
						}, self.options, function(err, api) {
							if (err) return done(err);
							self.provisionedServices[serviceConfig.name] = api;
							return done(null);
						});
					});
				} catch(err) {
					self.logger.error("serviceConfig", serviceConfig);
					return done(err);
				}
			});
		});
		return waitfor();
	}

	function connectToDB(callback) {
		try {
			//REDIS.debug_mode = true;
			self.db = REDIS.createClient(self.config.db.redis.port, self.config.db.redis.host);
			self.db.on("error", callback);
			if (self.config.db.redis.password) {
				self.db.auth(self.config.db.redis.password);
			}
			self.db.on("ready", function() {
/*
				KICKQ.config({
//					debug: self.options.debug || false,
//					loggerConsole: self.options.debug || false,
//					loggerLevel: KICKQ.LogLevel.FINE,
					redisHost: self.config.db.redis.host,
					redisPort: self.config.db.redis.port,
					redisPassword: self.config.db.redis.password || null,
					redisNamespace: self.config.db.redis.prefix + "kickq:",
					processTimeout: 60 * 2 * 1000,	// 2 minutes
					ghostRetry: false
				});

				self.kickq = KICKQ;
*/
				self.services = new SERVICES(self, self.options);
				self.contacts = new CONTACTS(self, self.options);

				return callback(null);
			});
		} catch(err) {
			return callback(err);
		}
	}

	return ensureProvisioned(function(err) {
		if (err) throw err;
		return connectToDB(function(err) {
			if (err) throw err;
			self.ready = true;
			return callback(null);
		});
	});
}

Rolodex.prototype.registerRoutes = function(app) {
	for (var routeName in this.routes) {
		if (routeName === "client") {
			mountStaticDir(app, this.routes[routeName], PATH.join(__dirname, "client"));
		} else {
			this.registerRoute(app, routeName);
// TMP: Remove once new demo is live.
			if (routeName === "services" || routeName === "contacts" || routeName === "logout" || routeName === "refetch") {
				this.registerRoute(app, routeName + "-get");
			}
		}
	}
}

Rolodex.prototype.getServicesSessionForSessionID = function(sessionID, callback) {
	return this.services.getForSessionID(sessionID, callback);
}

Rolodex.prototype.registerRoute = function(app, routeName) {
	var self = this;
	app[(
		routeName === "auth" ||
		routeName === "services" ||
		routeName === "contacts" ||
		routeName === "logout" ||
		routeName === "refetch"
	) ? "post" : "get"](self.routes[routeName.replace(/-get$/, "")], function(req, res, next) {
		try {
			if (!self.ready) {
				self.logger.warn("[openpeer-rolodex] Return 503 for request '" + req.url + "' as we are not yet ready.");
				res.writeHead(503, "Service Temporarily Unavailable", {
					"Content-Type": "text/plain",
					// `Retry-After` can be a relative number of seconds from now, or an RFC 1123 Date.
					"Retry-After": "5"
				});
				return res.end("Service Temporarily Unavailable");
			}

			function serviceIdForParams(params) {
				ASSERT.equal(typeof params, "object");
				ASSERT.equal(Array.isArray(params), true);
				ASSERT.equal(params.length, 1);
				ASSERT.equal(typeof params[0], "string");
				var serviceId = params[0].replace(/^\//, "");
				ASSERT.equal(typeof self.provisionedServices[serviceId], "object");
				return serviceId;
			}

			function augmentHeader(headers) {
				var origin = null;
				if (req.headers.origin) {
					if (self.config.allow && self.config.allow.hosts) {
						var parsedOrigin = URL.parse(req.headers.origin);
						self.config.allow.hosts.forEach(function(host) {
							if (origin) return;
							if (
								host === parsedOrigin.host ||
								host === parsedOrigin.hostname
							) {
								origin = req.headers.origin;
							}
						});
					}
				} else
				if (req.headers.host) {
					origin = [
						(self.options.port === 443) ? "https" : "http",
						"://",
						self.options.hostname,
						(self.options.port && self.options.port !== 443 && self.options.port !== 80) ? ":" + self.options.port : ""
					].join("");
				}
				if (origin) {
					headers["Access-Control-Allow-Methods:"] = "GET";
					headers["Access-Control-Allow-Credentials"] = "true";
					headers["Access-Control-Allow-Origin"] = origin;
					headers["Access-Control-Allow-Headers:"] = "*";
				}
				return headers;
			}

			if (routeName === "services" || routeName === "services-get") {
				return self.services.getForSessionID(req.sessionID, function(err, servicesSession) {
					if (err) return next(err);
					res.writeHead(200, augmentHeader({
						"Content-Type": "application/json"
					}));
					return res.end(JSON.stringify(servicesSession.getServices()));
				});
			} else
			if (routeName === "contacts" || routeName === "contacts-get") {
				return self.services.getForSessionID(req.sessionID, function(err, servicesSession) {
					if (err) return next(err);
					return servicesSession.getContacts((req.params[0] && serviceIdForParams(req.params)) || null, function(err, contacts) {
						if (err) return next(err);
						res.writeHead(200, augmentHeader({
							"Content-Type": "application/json"
						}));
						return res.end(JSON.stringify(contacts));
					});
				});
			} else
			if (routeName === "refetch" || routeName === "refetch-get") {
				return self.services.getForSessionID(req.sessionID, function(err, servicesSession) {
					if (err) return next(err);
					return servicesSession.fetchForService(serviceIdForParams(req.params), function(err, response) {
						if (err) return next(err);
						res.writeHead(200, augmentHeader({
							"Content-Type": "text/plain"
						}));
						return res.end(JSON.stringify(response));
					});
				});
			} else
			if (routeName === "logout" || routeName === "logout-get") {
				return self.services.getForSessionID(req.sessionID, function(err, servicesSession) {
					if (err) return next(err);
					return servicesSession.logoutService(serviceIdForParams(req.params), function(err) {
						if (err) return next(err);
						res.writeHead(200, augmentHeader({
							"Content-Type": "text/plain"
						}));
						return res.end("");
					});
				});
			} else
			if (routeName === "auth") {
				// Check if we have a request to initialize an auth sequence.
				// `POST` body from `app.use(EXPRESS.bodyParser())`
				ASSERT.equal(typeof req.body, "object");
				ASSERT.equal(typeof req.body.successURL, "string");
				ASSERT.equal(typeof req.body.failURL, "string");
				var serviceId = serviceIdForParams(req.params);
				if (!req.session.rolodex) {
					req.session.rolodex = {};
				}
				req.session.rolodex.auth = {
					successURL: req.body.successURL,
					failURL: req.body.failURL
				};
				var opts = {};
				if (typeof self.provisionedServices[serviceId].passportAuthOptions === "function") {
					opts = self.provisionedServices[serviceId].passportAuthOptions();
				}
				return passport.authenticate(serviceId, opts)(req, res, next);
			} else
			if (routeName === "authCallback") {
				ASSERT.equal(typeof req.session, "object");
				ASSERT.equal(typeof req.session.rolodex, "object");
				ASSERT.equal(typeof req.session.rolodex.auth, "object");
				ASSERT.equal(typeof req.session.rolodex.auth.successURL, "string");
				ASSERT.equal(typeof req.session.rolodex.auth.failURL, "string");
				var serviceId = serviceIdForParams(req.params);
				return passport.authenticate(serviceId, function(err, user, info) {
					if (err)  return next(err);
					if (!user) {
						var url = req.session.rolodex.auth.failURL;
						delete req.session.rolodex.auth;
						return res.redirect(url);
					}
					return self.services.getForSessionID(req.sessionID, function(err, servicesSession) {
						if (err) return next(err);
						return servicesSession.loginService(serviceId, user[serviceId], function(err) {
							if (err) return next(err);
							var url = req.session.rolodex.auth.successURL;
							delete req.session.rolodex.auth;
							return res.redirect(url);
						});
					});
				})(req, res, next);
			}			
		} catch(err) {
			return next(err);
		}
		return next();
	});
}


function mountStaticDir(app, route, path) {
    return app.get(route, function(req, res, next) {
        var originalUrl = req.url;
        req.url = req.params[0];
        return CONNECT.static(path)(req, res, function() {
            req.url = originalUrl;
            return next.apply(null, arguments);
        });
    });
};

function ensurePluginDependenciesInstalled(pluginPath, options, callback) {
	if (FS.existsSync(PATH.join(pluginPath, "node_modules"))) return callback(null);
	options.logger.info("[openpeer-rolodex] Installing plugin dependencies at '" + pluginPath + "' ...'");
	var npm = SPAWN("npm", [
		"install"
	], {
		stdio: "inherit",
		cwd: pluginPath
	});
	npm.on("error", function(err) {
		return callback(err);
	});
	npm.on("close", function (code) {
		if (code !== 0) {
			return callback(new Error("`npm install` for plugin '" + pluginPath + "' failed due to exit code '" + code + "'"));
		}
		options.logger.info("[openpeer-rolodex] Plugin dependencies successfully installed at '" + pluginPath + "'");
		return callback(null);
	});
}
