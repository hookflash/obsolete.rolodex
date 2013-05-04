
const ASSERT = require("assert");
const PATH = require("path");
const FS = require("fs");
const URL = require("url");
const WAITFOR = require("waitfor");
const DEEPMERGE = require("deepmerge");
const ESCAPE_REGEXP = require("escape-regexp-component");
const SPAWN = require("child_process").spawn;
const PASSPORT = require("passport");
const REDIS = require("redis");
const KICKQ = require("kickq");
const CONTACTS = require("./contacts");
const SERVICES = require("./services");


var passport = new PASSPORT.Passport();

passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(obj, done) {
    done(null, obj);
});


exports.hook = function(app, config, options) {
    app.use(passport.initialize());
    app.use(passport.session());
    var rolodex = new Rolodex(config, options);
    rolodex.registerRoutes(app);
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
		if (!config.routes) {
			config.routes = {};		
		}
		ASSERT.equal(typeof config.routes, "object");
		config.routes = DEEPMERGE({
			auth: "/.openpeer-rolodex/auth",
			authCallback: "/.openpeer-rolodex/callback",
			logout: "/.openpeer-rolodex/logout",
			refetch: "/.openpeer-rolodex/refetch",
			services: "/.openpeer-rolodex/services",
			contacts: "/.openpeer-rolodex/contacts"
		}, config.routes);
		if (!config.services || !Array.isArray(config.services) || config.services.length === 0) {
			throw new Error("No `config.services = [ ... ]` configured.");
		}

		self.config = config;

		function ensureProvisioned(callback) {
			var waitfor = WAITFOR.serial(callback);
			config.services.forEach(function(serviceConfig) {
				return waitfor(function(done) {
					try {
						ASSERT.equal(typeof serviceConfig, "object");
						ASSERT.equal(typeof serviceConfig.name, "string");
						var pluginDescriptorPath = PATH.join(__dirname, "services", serviceConfig.name, "package.json");
						if (!FS.existsSync(pluginDescriptorPath)) {
							throw new Error("No plugin found for `serviceConfig.name` '" + serviceConfig.name + "' at '" + PATH.dirname(pluginDescriptorPath) + "'");
						}
						ASSERT.equal(typeof serviceConfig.passport, "object");
						return ensurePluginDependenciesInstalled(PATH.dirname(pluginDescriptorPath), options, function(err) {
							if (err) return done(err);
							return require(PATH.dirname(pluginDescriptorPath)).init(self, passport, {
								passport: serviceConfig.passport,
								callbackURL: [
									(options.port === 443) ? "https" : "http",
									"://",
									options.hostname,
									(options.port && options.port !== 443 && options.port !== 80) ? ":" + options.port : "",
									config.routes.authCallback,
									"/",
									serviceConfig.name
								].join("")
							}, options, function(err, api) {
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
				self.db = REDIS.createClient(config.db.redis.port, config.db.redis.host);
				self.db.on("error", callback);
				if (config.db.redis.password) {
					self.db.auth(config.db.redis.password);
				}
				self.db.on("ready", function() {

					KICKQ.config({
						//debug: options.debug || false,
						redisHost: config.db.redis.host,
						redisPort: config.db.redis.port,
						redisPassword: config.db.redis.password || null,
						redisNamespace: config.db.redis.prefix + "kickq:" + config.db.redis.hostname + ":",
						processTimeout: 60 * 2 * 1000,	// 2 minutes
						ghostRetry: false
					});

					self.kickq = KICKQ;

					self.services = new SERVICES(self, options);
					self.contacts = new CONTACTS(self, options);

					return callback(null);
				});
			} catch(err) {
				return callback(err);
			}
		}

		ensureProvisioned(function(err) {
			if (err) throw err;
			return connectToDB(function(err) {
				if (err) throw err;
				self.ready = true;
			});
		});

		for (var name in config.routes) {
			var route = "^" + ESCAPE_REGEXP(config.routes[name]);
			if (name === "auth" || name === "authCallback" || name === "refetch" || name === "logout") {
				route += "\\/(.*)";
			} else
			if (name === "contacts") {
				route += "(\\/.*)?";
			}
			self.routes[name] = new RegExp(route + "$");
		}
	} catch(err) {
		self.logger.error("config", config);
		throw err;
	}
}

Rolodex.prototype.registerRoutes = function(app) {
	for (var name in this.routes) {
		this.registerRoute(app, name);
	}
}

Rolodex.prototype.registerRoute = function(app, name) {
	var self = this;
	app[(name === "auth") ? "post" : "get"](self.routes[name], function(req, res, next) {
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

			if (name === "services") {
				return self.services.getForSessionID(req.sessionID, function(err, servicesSession) {
					if (err) return next(err);
					res.writeHead(200, augmentHeader({
						"Content-Type": "application/json"
					}));
					return res.end(JSON.stringify(servicesSession.getServices()));
				});
			} else
			if (name === "contacts") {
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
			if (name === "refetch") {
				return self.services.getForSessionID(req.sessionID, function(err, servicesSession) {
					if (err) return next(err);
					return servicesSession.fetchForService(serviceIdForParams(req.params), function(err) {
						if (err) return next(err);
						res.writeHead(200, augmentHeader({
							"Content-Type": "text/plain"
						}));
						return res.end("");
					});
				});
			} else
			if (name === "logout") {
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
			if (name === "auth") {
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
			if (name === "authCallback") {
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
