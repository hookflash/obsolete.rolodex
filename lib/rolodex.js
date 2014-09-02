
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
//const KICKQ = require("kickq");
const CONNECT = require("connect");
const REQUEST = require("request");
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


function randomHex(bytes) {
	// We are not in browser.      
	var id = '';
	for (var i = 0; i < 5; i++) {
		var part = (Math.random() * 0x100000000).toString(16);
		id += '00000000'.substr(part.length) + part;
	}
	return id;
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
			contacts: "/.openpeer-rolodex/contacts",
			identityAccessRolodexCredentialsGet: "/.openpeer-rolodex/identity-access-rolodex-credentials-get",
			adminResetPeerContactID: "/.openpeer-rolodex/admin/reset-peer-contact-id"
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
					return ensurePluginDependenciesInstalled(PATH.dirname(pluginDescriptorPath), self.options, function(err) {
						if (err) return done(err);
						return require(PATH.dirname(pluginDescriptorPath)).init(self, passport, {
							passport: serviceConfig.passport || null,
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
 	var self = this;
	for (var routeName in self.routes) {
		if (routeName === "client") {
			mountStaticDir(app, self.routes[routeName], PATH.join(__dirname, "client"));
		} else {
			self.registerRoute(app, routeName);
// TMP: Remove once new demo is live.
			if (routeName === "services" || routeName === "contacts" || routeName === "logout" || routeName === "refetch") {
				self.registerRoute(app, routeName + "-get");
			}
		}
	}

	// TODO: Decide on `/.openpeer-rolodex` or not but not optional.
	app.options(/^(?:\/\.openpeer-rolodex)?\/rolodex-access$/, function(req, res, _next) {
		// Send CORS response.
		res.writeHead(200, self._augmentHeader(req, {}));
        return res.end();
	});
	app.post(/^(?:\/\.openpeer-rolodex)?\/rolodex-access$/, function(req, res, _next) {
		try {
			var request = req.body.request;
console.log("REQUEST", JSON.stringify(request, null, 4));

			var token = request.rolodex.serverToken;

			function sendResponse(result) {
				var payload = {
				  "result": {
				    "$domain": request.$domain,
				    "$appid": request.$appid,
				    "$id": request.$id,
				    "$handler": "rolodex",
				    "$method": "rolodex-access",
				    "$timestamp": Math.round(Date.now()/1000)
				  }
				};
				for (var name in result) {
				    payload.result[name] = 	result[name];				
				}
				var payload = JSON.stringify(payload, null, 4);
console.log("RESPONSE", payload);
				res.writeHead(200, self._augmentHeader(req, {
					"Content-Type": "application/json"
					// TODO: Ensure data is properly encoded so that length is accurate.
					//"Content-Length": payload.length
				}));
				return res.end(payload);
			}

			function next(err) {
				if (err) {
					console.error("Send error 500 to client:", err.stack);
					return sendResponse({
					    "error": {
					        "$id": 500,
					        "#text": "Internal Server Error"
					    }
					});
				}
				return _next();
			}

			return self.getServicesSessionForToken(request.$domain, token, function(err, servicesSession) {
				if (err) return next(err);

				var service = servicesSession.getServices()[servicesSession._tokenData.service];
				var payload = null;

				if (service.logoutReason === "ACCESS_TOKEN_EXPIRED") {
					return sendResponse({
					    "error": {
					      "$id": 424,
					      "#text": "Failed Rolodex Token Dependency"
					    }
					});
				}

				return sendResponse({
				    "rolodex": {
				      "accessToken": servicesSession.sessionID,
				      "accessSecret": servicesSession.sessionID,
				      "accessSecretExpires": Math.round(Date.now()/1000) + 60*60*24*365,
				      // If we have contacts on server we ask client to fetch immediately otherwise in 10 seconds.
				      "updateNext": (request.$timestamp || Math.round(Date.now()/1000)) + ((service.contactsTotal > 0) ? -60*60*24 : 10)
				    }
				    // TODO: Implement grant.
				    //"namespaceGrantChallenge": {
				    //  "$id": "20651257fecbe8436cea6bfd3277fec1223ebd63",
				    //  "name": "Provider Rolodex Service",
				    //  "image": "https://provider.com/rolodex/rolodex.png",
				    //  "url": "https://provider.com/rolodex/",
				    //  "domains": "trust.com,trust2.com"
				    //}
				});
			});
		} catch(err) {
			return _next(err);
		}
	});

	// TODO: Decide on `/.openpeer-rolodex` or not but not optional.
	app.options(/^(?:\/\.openpeer-rolodex)?\/rolodex-contacts-get$/, function(req, res, _next) {
		// Send CORS response.
		res.writeHead(200, self._augmentHeader(req, {}));
        return res.end();
	});
	app.post(/^(?:\/\.openpeer-rolodex)?\/rolodex-contacts-get$/, function(req, res, _next) {

		try {
			var request = req.body.request;
	console.log("REQUEST", JSON.stringify(request, null, 4));

			var token = request.rolodex.serverToken;

			function sendResponse(result) {
				var payload = {
				  "result": {
				    "$domain": request.$domain,
				    "$appid": request.$appid,
				    "$id": request.$id,
				    "$handler": "rolodex",
				    "$method": "rolodex-contacts-get",
				    "$timestamp": Math.round(Date.now()/1000)
				  }
				};
				for (var name in result) {
				    payload.result[name] = 	result[name];				
				}
				var payload = JSON.stringify(payload, null, 4);
	console.log("RESPONSE", payload);
				res.writeHead(200, self._augmentHeader(req, {
					"Content-Type": "application/json"
					// TODO: Ensure data is properly encoded so that length is accurate.
					//"Content-Length": payload.length
				}));
				return res.end(payload);
			}

			function next(err) {
				if (err) {
					console.error("Send error 500 to client:", err.stack);
					return sendResponse({
					    "error": {
					        "$id": 500,
					        "#text": "Internal Server Error"
					    }
					});
				}
				return _next();
			}

			return self.getServicesSessionForToken(request.$domain, token, function(err, servicesSession) {
				if (err) return next(err);

				var service = servicesSession.services[servicesSession._tokenData.service];

				if (service.logoutReason === "ACCESS_TOKEN_EXPIRED") {
					return sendResponse({
					    "error": {
					        "$id": 424,
					        "#text": "Failed Rolodex Token Dependency"
					    }
					});
				}

				return servicesSession.getContactsPayload(servicesSession._tokenData.service, request, {
					identityDomain: servicesSession._tokenData.service,
					providerDomain: servicesSession._tokenData.service
				}, function(err, payload) {
					if (err) return next(err);
					return sendResponse(payload);
				});
			});
		} catch(err) {
			return _next(err);
		}
	});
}


Rolodex.prototype.getServicesSessionForSessionID = function(sessionID, callback) {
	return this.services.getForSessionID(sessionID, callback);
}

var getServicesSessionForToken__providers = null;
Rolodex.prototype.getServicesSessionForToken = function(domain, token, callback) {
	var self = this;
	function getTokenSecret(forceFetch, callback) {
		function ensureFetched(callback) {
			if (getServicesSessionForToken__providers && forceFetch !== true) {
				return callback(null);
			}
			return REQUEST({
				method: "POST",
				url: self.config.api.registrationServiceUrl,
				body: JSON.stringify({
					"request": {
						"$domain": "hcs-javascript.hookflash.me",
						"$id": randomHex(32),
						"$handler": "registration",
						"$method": "providers-get",
						"$timestamp": 0
					}
				}),
	            json: true
			}, function(err, res, body) {
				if (err) return callback(err);
				var found = false;
				if (!body || !body.result || !body.result.providers || !body.result.providers.provider) {
					var err = new Error("No `result.providers.provider` property in call to: " + self.config.api.registrationServiceUrl);
					err.code = 500;
					return callback(err);
				}
				getServicesSessionForToken__providers = Array.isArray(body.result.providers.provider) ? body.result.providers.provider : [ body.result.providers.provider ];
				return callback(null);
			});
		}
		return ensureFetched(function(err) {
			if (err) return callback(err);
			var found = false;
			getServicesSessionForToken__providers.forEach(function(provider) {
				if (found) return;
				if (provider.domain === domain) {
					found = provider;
				}
			});
			if (!found) {
				var err = new Error("Domain '" + domain + "' not registered as identity provider!");
				err.code = 500;
				return callback(err);
			}
			return callback(null, found.hostingSecret);
		});
	}

	return getTokenSecret(false, function(err, tokenSecret) {
		if (err) return callback(err);
		return self.services.getForToken(token, tokenSecret, function(err, servicesSession) {
			if (err) {
				if (err.code === "TOKEN_DECRYPT_ERROR") {
					console.warn("Refetch provider list from registration service as we could not decrypt token for domain '" + domain + "'!");
					return getTokenSecret(true, function(err, tokenSecret) {
						if (err) return callback(err);

						return self.services.getForToken(token, tokenSecret, callback);
					});
				}
				return callback(err);
			}
			return callback(null, servicesSession);
		});
	});
}

Rolodex.prototype._augmentHeader = function(req, headers) {
	var origin = null;
	if (req.headers.origin) {
		if (this.config.allow && this.config.allow.hosts) {
			var parsedOrigin = URL.parse(req.headers.origin);
			this.config.allow.hosts.forEach(function(host) {
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
			(this.options.port === 443) ? "https" : "http",
			"://",
			this.options.hostname,
			(this.options.port && this.options.port !== 443 && this.options.port !== 80) ? ":" + this.options.port : ""
		].join("");
	}
	if (origin) {
		headers["Access-Control-Allow-Methods"] = "GET";
		headers["Access-Control-Allow-Credentials"] = "true";
		headers["Access-Control-Allow-Origin"] = origin;
		headers["Access-Control-Allow-Headers"] = "Content-Type";
	}
	return headers;
}

Rolodex.prototype.registerRoute = function(app, routeName) {
	var self = this;
	app[(
		routeName === "auth" ||
		routeName === "services" ||
		routeName === "contacts" ||
		routeName === "logout" ||
		routeName === "refetch" ||
		routeName === "identityAccessRolodexCredentialsGet"
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
				serviceId = serviceId.split("/");
				if (serviceId.length === 1) {
					ASSERT.equal(typeof self.provisionedServices[serviceId[0]], "object");
					return serviceId[0];
				} else {
					ASSERT.equal(typeof self.provisionedServices[serviceId[0]], "object");
					return serviceId;
				}
			}

			if (routeName === "services" || routeName === "services-get") {
				return self.services.getForSessionID(req.sessionID, function(err, servicesSession) {
					if (err) return next(err);
					res.writeHead(200, self._augmentHeader(req, {
						"Content-Type": "application/json"
					}));
					return res.end(JSON.stringify(servicesSession.getServices()));
				});
			} else
			if (routeName === "contacts" || routeName === "contacts-get") {
				return self.services.getForSessionID(req.sessionID, function(err, servicesSession) {
					if (err) return next(err);
					var serviceId = (req.params[0] && serviceIdForParams(req.params)) || null;
					if (serviceId && Array.isArray(serviceId)) {
						return servicesSession.getFullContact(serviceId[0], serviceId[1], function(err, detail) {
							if (err) return next(err);
							res.writeHead(200, self._augmentHeader(req, {
								"Content-Type": "application/json"
							}));
							return res.end(JSON.stringify(detail));
						});
					} else {
						return servicesSession.getContacts(serviceId, function(err, contacts) {
							if (err) return next(err);
							res.writeHead(200, self._augmentHeader(req, {
								"Content-Type": "application/json"
							}));
							return res.end(JSON.stringify(contacts));
						});
					}
				});
			} else
			if (routeName === "refetch" || routeName === "refetch-get") {
				return self.services.getForSessionID(req.sessionID, function(err, servicesSession) {
					if (err) return next(err);
					return servicesSession.fetchForService(serviceIdForParams(req.params), function(err, response) {
						if (err) return next(err);
						res.writeHead(200, self._augmentHeader(req, {
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
						res.writeHead(200, self._augmentHeader(req, {
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
				if (!req.session.rolodex || !req.session.rolodex.auth) {
					res.writeHead(200, self._augmentHeader(req, {
						"Content-Type": "text/plain"
					}));
					return res.end("Your session has expired. Please relogin!");
				}
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
			} else
			if (routeName === "identityAccessRolodexCredentialsGet") {
				return self.services.getForSessionID(req.sessionID, function(err, servicesSession) {
					if (err) return next(err);

					ASSERT.equal(typeof req.body.request, "object");
					ASSERT.equal(typeof req.body.request.identity, "object");
					ASSERT.equal(typeof req.body.request.identity.uri, "string");

					var request = req.body.request;
					var identityUri = request.identity.uri;
					var serviceId = identityUri.match(/^identity:\/\/([^\/]*)\/(|[^\/]*)?$/)[1].split(".")[0];

					if (!servicesSession.services[serviceId]) {
						res.writeHead(404, self._augmentHeader(req, {
							"Content-Type": "text/plain"
						}));
						return res.end("");
					}

					var payload = JSON.stringify({
					  "result": {
					    "$domain": request.$domain,
					    "$appid": request.$appid,
					    "$id": request.$id,
					    "$handler": "rolodex",
					    "$method": "rolodex-access",
					    "$timestamp": Math.round(Date.now()/1000),
						"rolodex": {
							"serverToken": servicesSession.services[serviceId].token || null
						}
					  }
					}, null, 4);

					res.writeHead(200, self._augmentHeader(req, {
						"Content-Type": "application/json",
						"Content-Length": payload.length
					}));
					return res.end(payload);
				});				
			} else
			if (routeName === "adminResetPeerContactID") {
				return self.services.getForSessionID(req.sessionID, function(err, servicesSession) {
					if (err) return next(err);
					servicesSession.resetPeerContactID(function(err) {
						if (err) return next(err);
						res.writeHead(200, self._augmentHeader(req, {
							"Content-Type": "text/plain"
						}));
						return res.end("");
					});
				});				
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
