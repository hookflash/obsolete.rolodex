
const ASSERT = require("assert");
const WAITFOR = require("waitfor");
const CRYPTO = require("crypto");
const Q = require("q");
const UTILS = require("cifre/utils");
const AES = require("cifre/aes");
const MD5 = require("cifre/md5");
const FORGE_UTIL = require("cifre/forge/util")();
const SHA1 = require("cifre/forge/sha1")();
const SHA256 = require("cifre/forge/sha256")();

const DB_KEY_NS = "30";


var fullContacts = {};


function arrayToAscii(array) {
	var string = "";
	for (var i = 0, l = array.length; i < l; i++) {
		string += String.fromCharCode(array[i]);
	}
	return string;
}

function md5(data) {
	return UTILS.tohex(MD5(UTILS.stringToArray(data)));
}

function sha256(data) {
	var md = SHA256.create();
	md.start();
	md.update(data);
	return md.digest().toHex();
}

function encrypt(key, iv, data) {
	var state = UTILS.stringToArray(data);
	AES.cfb.encrypt(state, AES.keyExpansion(UTILS.fromhex(key)), UTILS.fromhex(iv));
	return UTILS.tohex(state);
}

function decrypt(key, iv, data) {
	var state = UTILS.fromhex(data);
	AES.cfb.decrypt(state, AES.keyExpansion(UTILS.fromhex(key)), UTILS.fromhex(iv));
	return arrayToAscii(state);
}

function decryptToken(token, tokenSecret, callback) {
	var tokenParts = token.split("-");
	var tokenData = decrypt(sha256(tokenSecret), tokenParts[0], tokenParts[1]);
	var credentials = null;
	try {
		credentials = JSON.parse(tokenData);
	} catch(err) {
		err.code = "TOKEN_DECRYPT_ERROR";
		//console.error("Error parsing token data:", tokenData, "from token:", token);
		//console.error(err.stack);
		return callback(err);
	}
	return callback(null, credentials);
}

function encryptToken(tokenInfo, tokenSecret, callback) {
    return CRYPTO.randomBytes(32, function(err, buffer) {
        if (err) return callback(err);
        var token = null;
        try {
            var iv = CRYPTO.createHash("md5");
            iv.update(buffer.toString("hex"));
            iv = iv.digest();
            var secretHash = CRYPTO.createHash("sha256");
            secretHash.update(tokenSecret);
            secretHash = secretHash.digest();
            var cipher = CRYPTO.createCipheriv('aes-256-cbc', secretHash, iv);
            var encryptdata = cipher.update(JSON.stringify(tokenInfo), 'utf8', 'binary');
            encryptdata += cipher.final('binary');
            token = iv.toString('hex') + "-" + new Buffer(encryptdata, 'binary').toString('base64');
        } catch(err) {
            return callback(err);
        }
        return callback(null, token);
    });
}


function Services(rolodex, options) {
	var self = this;
	self.rolodex = rolodex;
	self.options = options;

	if (rolodex.kickq) {
		rolodex.kickq.process([
			"fetch-for-service"
		], {
			concurrentJobs: 10
		}, function(jobItem, jobData, callback) {
			try {
				self.options.logger.debug("[rolodex][job:fetch-for-service] Running job:", jobItem.data);

				ASSERT.equal(typeof jobData.sessionID, "string");
				ASSERT.equal(typeof jobData.serviceId, "string");
				ASSERT.equal(typeof jobData.credentials, "object");

				return self.getForSessionID(jobData.sessionID, function(err, servicesSession) {
					if (err) throw err;
					return servicesSession._runFetchForService(jobData.serviceId, jobData.credentials, function(err) {
						if (err) {
							self.options.logger.error("[rolodex][job:fetch-for-service] Finished job '" + jobItem.id + "' with error:", err.stack);
							return callback(err.message);
						}
						self.options.logger.debug("[rolodex][job:fetch-for-service] Finished job '" + jobItem.id + "' successfully");
						return callback();
					});
				});

			} catch(err) {
				self.options.logger.error("[rolodex][job:fetch-for-service] Error initializing job:", err.stack);
				return callback(err.message);
			}
		});
	}
}

Services.prototype.getForSessionID = function(sessionID, callback) {
	var self = this;
	var session = new ServicesSession(self.rolodex, sessionID, self.options);
	return session.load(function(err) {
		if (err) return callback(err);
		try {
			return callback(null, session);
		} catch(err) {
			return callback(err);
		}
	});
}

Services.prototype.getForToken = function(token, tokenSecret, callback) {
	var self = this;

	return decryptToken(token, tokenSecret, function(err, credentials) {
		if (err) return callback(err);

		try {
			var id = UTILS.tohex(MD5((
						// Ideally we use a user identifier to namespace cache as it works across login sessions.
						credentials.identifier &&
						(credentials.service + ":" + credentials.identifier)
						// Fall back to token which lives for current login session only.
					 ) || (token.split("-")[0] + ":" + credentials.token)));

			var session = new ServicesSession(self.rolodex, id, self.options);

			session._tokenData = credentials;

			self.rolodex.config.services.filter(function(service) {
				if (service.name === credentials.service) return true;
				return false;
			})[0].passport = {
				consumerKey: credentials.consumer_key,
				consumerSecret: credentials.consumer_secret
			};

			return session.load(function(err) {
				if (err) return callback(err);

				return session.loginService(credentials.service, {
					accessToken: credentials.token,
					accessTokenSecret: credentials.token_secret
				}, function(err) {
					if (err) return callback(err);
					return callback(null, session);
				});
			});

		} catch(err) {
			return callback(err);
		}
	});
}

Services.prototype.getForTokenInfo = function(credentials, callback) {
	var self = this;
	try {
		var id = UTILS.tohex(MD5((
					// Ideally we use a user identifier to namespace cache as it works across login sessions.
					credentials.identifier &&
					(credentials.service + ":" + credentials.identifier)
					// Fall back to token which lives for current login session only.
				 ) || (token.split("-")[0] + ":" + credentials.token)));

		var session = new ServicesSession(self.rolodex, id, self.options);

		session._tokenData = credentials;

		self.rolodex.config.services.filter(function(service) {
			if (service.name === credentials.service) return true;
			return false;
		})[0].passport = {
			consumerKey: credentials.consumer_key,
			consumerSecret: credentials.consumer_secret
		};

		return session.load(function(err) {
			if (err) return callback(err);

			return session.loginService(credentials.service, {
				accessToken: credentials.token,
				accessTokenSecret: credentials.token_secret,
				id: credentials.identifier,
				displayName: credentials.displayName || credentials.username,
				consumerKey: credentials.consumer_key,
				consumerSecret: credentials.consumer_secret
			}, function(err) {
				if (err) return callback(err);
				return callback(null, session);
			});
		});

	} catch(err) {
		return callback(err);
	}
}


function ServicesSession(rolodex, sessionID, options) {
	var self = this;
	self.rolodex = rolodex;
	self.options = options;
	self.sessionID = sessionID;
	self.services = {};
	self.servicesLoaded = null;
	function initService(serviceId) {
		var hidden = {
			contacts: {},
			credentials: {},
			load: function(callback) {
			},
			save: function(callback) {
			}
		};
		var service = Object.create(hidden);
		service.loggedin = false;
		service.logoutReason = false;
		service.fetching = false;
		service.lastFetchTime = false;
		service.fetchCount = 0;
		service.error = false;
		service.hCard = null;
		service.token = null;
		service.contactsTotal = 0;
		service.contactsFetched = 0;
		// For some contacts there is no data available due to privary settings.
		// We record these just for informational purposes. They are not counted
		// in `service.contactsTotal` nor `service.contactsFetched`.
		// TODO: We may get rid of `service.contactsDropped` as linkedin is the only service using it so far.
		service.contactsDropped = 0;
		service.authURL = [
			(options.port === 443) ? "https" : "http",
			"://",
			options.hostname,
			(options.port && options.port !== 443 && options.port !== 80) ? ":" + options.port : "",
			self.rolodex.config.routes.auth,
			"/",
			serviceId
		].join("");
		service.logoutURL = [
			(options.port === 443) ? "https" : "http",
			"://",
			options.hostname,
			(options.port && options.port !== 443 && options.port !== 80) ? ":" + options.port : "",
			self.rolodex.config.routes.logout,
			"/",
			serviceId
		].join("");
		service.refetchURL = [
			(options.port === 443) ? "https" : "http",
			"://",
			options.hostname,
			(options.port && options.port !== 443 && options.port !== 80) ? ":" + options.port : "",
			self.rolodex.config.routes.refetch,
			"/",
			serviceId
		].join("");
		service.tokenUrl = [
			(options.port === 443) ? "https" : "http",
			"://",
			options.hostname,
			(options.port && options.port !== 443 && options.port !== 80) ? ":" + options.port : "",
			self.rolodex.config.routes.token,
			"/facebook",
			"?sid=" + self.sessionID
		].join("");
		service.sid = self.sessionID;
		self.services[serviceId] = service;
	}
	for (var serviceId in self.rolodex.provisionedServices) {
		initService(serviceId);
	}
}

ServicesSession.prototype._getDBKey = function() {
	return [
		this.rolodex.config.db.redis.prefix,
		DB_KEY_NS,
		":",
		"services",
		":",
		this.sessionID
	].join("");
}

ServicesSession.prototype.load = function(callback) {
	var self = this;
    return self.rolodex.db.get(self._getDBKey(), function (err, reply) {
    	if (err) return callback(err);
    	if (reply) {
    		try {
    			self.servicesLoaded = reply;
    			var data = JSON.parse(reply);
    			for (var serviceId in data) {
    				if (self.services[serviceId]) {
		    			for (var key in data[serviceId]) {
		    				if (self.services[serviceId].hasOwnProperty(key)) {
			    				self.services[serviceId][key] = data[serviceId][key];
			    			} else {
			    				self.services[serviceId].__proto__[key] = data[serviceId][key];
			    			}
		    			}
	    			}
    			}
    		} catch(err) {
    			return callback(new Error("Error parsing redis response for key '" + self._getDBKey() + "'"));
    		}
    	}
		return callback(null);
    });
}

ServicesSession.prototype.save = function(changes, callback) {
	var self = this;
	if (typeof changes === "function" && typeof callback === "undefined") {
		callback = changes;
		changes = null;
	}
	function save(callback) {
		// TODO: Have records expire after some time for stale users (e.g. 1 month).
		var services = {};
		for (var serviceId in self.services) {
			services[serviceId] = {};
			for (var key in self.services[serviceId]) {
				if (key !== "authURL" && key !== "logoutURL" && key !== "refetchURL") {
					if (changes && changes[serviceId] && typeof changes[serviceId][key] !== "undefined") {
						services[serviceId][key] = changes[serviceId][key];
					} else {
						services[serviceId][key] = self.services[serviceId][key];
					}
				}
			}
			for (var key in self.services[serviceId].__proto__) {
				if (key !== "contacts") {
					if (changes && changes[serviceId] && typeof changes[serviceId][key] !== "undefined") {
						services[serviceId][key] = changes[serviceId][key];
					} else {
						services[serviceId][key] = self.services[serviceId].__proto__[key];
					}
				}
			}		
		}
		services = JSON.stringify(services);
		if (services === self.servicesLoaded) {
			return callback(null);		
		}
	    return self.rolodex.db.get(self._getDBKey(), function (err, reply) {
	    	if (err) return callback(err);
	    	if (reply && reply !== self.servicesLoaded) {
console.log("DB DATA ORIGINAL", JSON.stringify(JSON.parse(self.servicesLoaded), null, 4));
console.log("DB DATA NOW", JSON.stringify(JSON.parse(reply), null, 4));
console.log("DB DATA TO SAVE", JSON.stringify(JSON.parse(services), null, 4));
	    		return callback(new Error("Could not save to DB as DB value changed from what we originally loaded."));
	    	}
		    return self.rolodex.db.set(self._getDBKey(), services, function (err, reply) {
		    	if (err) return callback(err);
		    	self.servicesLoaded = services;
				return callback(null);
		    });
		});
	}
	if (changes) {
		return self.load(function(err) {
			if (err) return callback(err);
			return save(callback);
		});
	}
	return save(callback);
}

ServicesSession.prototype.getServices = function() {
	return this.services;
}

ServicesSession.prototype._getContactsKey = function(serviceId, time) {
	return [
		this.rolodex.config.db.redis.prefix,
		DB_KEY_NS,
		":",
		"contacts",
		":",
		time,
		":",
		this.services[serviceId].hCard.uid
	].join("");
}

ServicesSession.prototype._getPeerContactsKey = function(identity) {
	return [
		this.rolodex.config.db.redis.prefix,
		"identity",
		":",
		"peercontact",
		":",
		identity
	].join("");
}

ServicesSession.prototype.loadContactsForService = function(serviceId, callback) {
	var self = this;
	if (!self.services[serviceId].hCard) return callback(null);
    return self.rolodex.db.get(self._getContactsKey(serviceId, self.services[serviceId].lastFetchTime), function (err, reply) {
    	if (err) return callback(err);
    	if (!reply) {
			return callback(null);
    	}
		try {
			var data = JSON.parse(reply);
			var peerContactKeys = [];
			for (var contactId in data.fetched) {
    			self.services[serviceId].contacts[contactId] = data.fetched[contactId];
    			peerContactKeys.push(self._getPeerContactsKey(serviceId + ":" + contactId));
    		}
			self.services[serviceId].contactsFetched = Object.keys(self.services[serviceId].contacts).length;
			self.services[serviceId].contactsDropped = data.dropped;

		} catch(err) {
			return callback(new Error("Error parsing redis response for key '" + self._getContactsKey(serviceId, self.services[serviceId].lastFetchTime) + "'"));
		}
		if (peerContactKeys.length === 0) {
			return callback(null);
		}
	    return self.rolodex.db.mget(peerContactKeys, function (err, reply) {
	    	if (err) return callback(err);
	    	if (reply) {
	    		for (var i=0; i<peerContactKeys.length ; i++) {
	    			if (reply[i]) {
	    				var m = peerContactKeys[i].match(/:([^:]*):([^:]*)$/);
	    				self.services[m[1]].contacts[m[2]].peerContact = reply[i];
	    			}
	    		}
	    	}
			return callback(null);
	    });
    });
}

ServicesSession.prototype.getCntactsForServiceAndTimestamp = function(serviceId, timestamp, callback) {
	var self = this;
	if (!self.services[serviceId].hCard) return callback(null);
    return self.rolodex.db.get(self._getContactsKey(serviceId, timestamp), function (err, reply) {
    	if (err) return callback(err);
    	if (!reply) {
			return callback(null);
    	}
    	var data = null;
		try {
			data = JSON.parse(reply);
		} catch(err) {
			return callback(new Error("Error parsing redis response for key '" + self._getContactsKey(serviceId, timestamp) + "'"));
		}
		return callback(null, data);
    });
}

ServicesSession.prototype.resetPeerContactID = function(callback) {
	var self = this;
	var changedServices = [];
	var waitfor = WAITFOR.parallel(function(err) {
		if (err) return callback(err);
		if (changedServices.length === 0) return callback(null);
		return self.save(function(err) {
			if (err) return callback(err);
			self.rolodex.emit("service.updated", changedServices, self);
			return callback(null);
		});
	});
	for (var serviceId in self.services) {
		if (!self.services[serviceId].hCard || !self.services[serviceId].hCard.peerContact) continue;
		waitfor(serviceId, function(serviceId, done) {
			changedServices.push(serviceId);
			delete self.services[serviceId].hCard.peerContact;
		    return self.rolodex.db.del(self._getPeerContactsKey(self.services[serviceId].hCard.uid), function (err, reply) {
		    	if (err) return done(err);
				return done(null);
		    });
		});
	}
	waitfor();
}

ServicesSession.prototype.saveContactsForService = function(serviceId, callback) {
	var self = this;
	// TODO: Have records expire after some time for stale users (e.g. 1 month).
    return self.rolodex.db.set(self._getContactsKey(serviceId, self.services[serviceId].lastFetchTime), JSON.stringify({
    	dropped: self.services[serviceId].contactsDropped,
    	fetched: self.services[serviceId].contacts
    }), function (err, reply) {
    	if (err) return callback(err);
    	// TODO: Set expiry of contacts to 30 days so redis will remove.
		return callback(null);
    });
}

ServicesSession.prototype.getContacts = function(onlyServiceId, callback) {
	var self = this;
	var contacts = {};
	var waitfor = WAITFOR.parallel(function(err) {
		if (err) return callback(err);
		if (onlyServiceId) {
			return callback(null, contacts[onlyServiceId] || {});
		}
		return callback(null, contacts);
	});
	for (var serviceId in self.services) {
		waitfor(serviceId, function(serviceId, done) {
			return self.loadContactsForService(serviceId, function(err) {
				if (err) return done(err);
				contacts[serviceId] = self.services[serviceId].contacts;
				return done(null);
			});
		});
	}
	return waitfor();
}

ServicesSession.prototype.getContactsPayload = function(onlyServiceId, request, options, callback) {
	var self = this;

	var service = self.services[onlyServiceId];

	return self.getContacts(onlyServiceId, function(err, contacts) {
		if (err) return callback(err);

		function getDelta(callback) {
			if (
				!request.rolodex.version ||
				request.rolodex.version === ""
			) {
				// The client does not specify version. We send everything back.
				return callback(null, false);
			}
			if (request.rolodex.version === service.lastFetchTime) {
				// The client has the latest version. We send an empty delta back.
				return callback(null, []);
			}
			return self.getCntactsForServiceAndTimestamp(onlyServiceId, request.rolodex.version, function(err, result) {
				if (err) return callback(err);

				if (!result) {
					// Not found in cache. We send a 409 back.
					return callback(null, {
						found: false
					});
				}

				if (self.options.test === true) {
					result.fetched = {
					    '1': {
					        uid: 'github: 1',
					        nickname: 'a',
					        fn: null,
					        photo: 'p1'
					    },
					    '2': {
					        uid: 'github: 2',
					        nickname: 'b',
					        fn: null,
					        photo: 'p2'
					    }
					};
					contacts = {
					    '2': {
					        uid: 'github: 2',
					        nickname: 'b',
					        fn: null,
					        photo: 'p2'
					    },
					    '3': {
					        uid: 'github: 3',
					        nickname: 'c',
					        fn: null,
					        photo: 'p3'
					    }
					};
				}

				var delta = [];

				for (var contactId in result.fetched) {
					if (!contacts[contactId]) {
						delta.push({
							"$disposition": "remove",
						    // TODO: Get service plugin to format.
				            "uri": "identity://" + options.identityDomain + "/" + contactId,
						    // TODO: Get service plugin to format.
				            "provider": options.providerDomain,
						});
					}
				}

				for (var contactId in contacts) {
					if (JSON.stringify(result.fetched[contactId]) !== JSON.stringify(contacts[contactId])) {
						delta.push({
				            "$disposition": "update",
						    // TODO: Get service plugin to format.
				            "uri": "identity://" + options.identityDomain + "/" + contactId,
						    // TODO: Get service plugin to format.
				            "provider": options.providerDomain,
				            "name": contacts[contactId].fn || contacts[contactId].nickname,
						    // TODO: Get service plugin to format.
				            "profile": "",
						    // TODO: Get service plugin to format.
				            "vprofile": "",
						    // TODO: Get service plugin to format.
				            "feed": "",
				            "avatars": {
				               "avatar": { "url": contacts[contactId].photo }
				            }
				        });
					}
				}

				return callback(null, delta);
			});
		}

		function refresh(callback) {
			if (!request.rolodex.refresh) {
				return callback(null, {});
			}
			// We force a re-fetch if we still have no contacts.					
			if (service.contactsTotal === 0) {
				service.fetching = false;
			}
			return self.fetchForService(onlyServiceId, callback);
		}

		return getDelta(function(err, delta) {
			if (err) return callback(err);

			if (typeof delta === "object" && delta.found === false) {
				return callback(null, {
					"error": {
				       "$id": 409,
				       "#text": "Conflict"
				    }
				});
			}

			return refresh(function(err, info) {
				if (err) return callback(err);

				if (info.error) {
					// TODO: Format error according to spec.
					info.error["$id"] = 500;
					info.error["#text"] = "Internal Server Error";
					return callback(null, {
						error: info.error
					});
				}

				var service = self.getServices()[onlyServiceId];

				if (delta === false) {

					var identities = [];
					for (var contactId in contacts) {
						identities.push({
				            "$disposition": "update",
						    // TODO: Get service plugin to format.
				            "uri": "identity://" + options.identityDomain + "/" + contactId,
						    // TODO: Get service plugin to format.
				            "provider": options.providerDomain,
				            "name": contacts[contactId].fn || contacts[contactId].nickname,
						    // TODO: Get service plugin to format.
				            "profile": "",
						    // TODO: Get service plugin to format.
				            "vprofile": "",
						    // TODO: Get service plugin to format.
				            "feed": "",
				            "avatars": {
				               "avatar": { "url": contacts[contactId].photo }
				            }
				        });
					}

					return callback(null, {
					    "rolodex": {
					      // If we are fetching on server we ask client to fetch contacts again in 10 seconds otherwise one day.
					      "updateNext": (request.$timestamp || Math.round(Date.now()/1000)) + ((service.fetching) ? 10 : 60*60*24),
					      "version": service.lastFetchTime || ""
					    },
					    "identities": {
					    	"identity": identities
					    }
					});

				} else {

					return callback(null, {
					    "rolodex": {
					      // If we are fetching on server we ask client to fetch contacts again in 10 seconds otherwise one day.
					      "updateNext": (request.$timestamp || Math.round(Date.now()/1000)) + ((service.fetching) ? 10 : 60*60*24),
					      "version": service.lastFetchTime || ""
					    },
					    "identities": {
					    	"identity": delta
					    }
					});
				}
			});
		});
	});
}

ServicesSession.prototype.loginService = function(serviceId, credentials, callback) {
	var self = this;
	var service = self.services[serviceId];
	service.loggedin = true;
	service.logoutReason = false;
	service.__proto__.credentials = credentials;

	function setToken(callback) {
		if (!self.rolodex.config.api || !self.rolodex.config.api.tokenSecret) {
			return callback(null);
		}
		/*
		<sharedSecret> = 52+ plain text characters
		<iv> = MD5 random hash (16 bytes)
		token = hex(<iv>) + "-" + hex(AES.encrypt(sha256(<sharedSecret>), <iv>, <credentials>))

		<credentials> = JSON.stringify({
		    service: <name (github|twitter|linkedin|facebook)>
		    consumer_key: <OAuth consumer/api key provided by service>,
		    consumer_secret: <OAuth consumer/api secret provided by service>,
		    token: <OAuth access token>,
		    token_secret: <OAuth access token secret>
		})
		*/

		var config = self.rolodex.config.services.filter(function(service) {
			if (service.name === serviceId) return true;
			return false;
		})[0].passport;
		var consumer_key = config.consumerKey || config.clientID || config.apiKey || config.appID;
		var consumer_secret = config.consumerSecret || config.clientSecret || config.secretKey || config.appSecret;

		var tokenInfo = {
			service: serviceId,
            originalId: service.credentials.id,
            displayName: service.credentials.displayName,
			identifier: (service.hCard && service.hCard.uid) || null,
			consumer_key: consumer_key,
			consumer_secret: consumer_secret,
			token: credentials.accessToken
		};
		if (credentials.accessTokenSecret) {
			tokenInfo.token_secret = credentials.accessTokenSecret;
		}

		return encryptToken(tokenInfo, self.rolodex.config.api.tokenSecret, function(err, token) {
			if (err) return callback(err);

			service.token = token;

			return callback(null);
		});
	}

	return setToken(function(err) {
		if (
			service.hCard &&
			service.contactsTotal > 0 &&
			service.contactsFetched > 0 &&
			service.contactsFetched === service.contactsTotal
		) {
			// Looks like we are all up to date.
			return self.save(callback);
		}
		// Looks like we need to fetch.
		return self.fetchForService(serviceId, function(err) {
			if (err) return callback(err);
			return self.save(callback);
		});
	});
}

ServicesSession.prototype.logoutService = function(serviceId, callback) {
	var self = this;
	var service = self.services[serviceId];
	service.loggedin = false;
	service.token = null;
	service.logoutReason = "LOGOUT";
	return self.save(callback);
}

ServicesSession.prototype.logoutAllServices = function(callback) {
	var self = this;
	console.log("logout all services");
	var waitfor = WAITFOR.serial(callback);
	for (var serviceId in self.services) {
		if (self.services[serviceId].loggedin) {
			console.log("logout service", serviceId);
			waitfor(serviceId, self.logoutService);
		}
	}
	return waitfor();
}

ServicesSession.prototype.getFullContact = function(serviceId, userId, callback) {
	var self = this;
	var service = self.services[serviceId];
	if (!service.loggedin) {
		return callback(null, {
			error: "NOT_LOGGED_IN"
		});
	}
	if (fullContacts[serviceId] && fullContacts[serviceId][userId]) {
		return fullContacts[serviceId][userId].promise.then(function(detail) {
			return callback(null, detail);
		});
	}
	self.options.logger.debug("[rolodex] Fetch full contact for", "serviceId", serviceId, "userId", userId);
	if (!fullContacts[serviceId]) {
		fullContacts[serviceId] = {};
	}
	fullContacts[serviceId][userId] = Q.defer();
	if (typeof self.rolodex.provisionedServices[serviceId].fetchFullContact !== "function") {
		return callback(null, {
			error: "FULL_CONTACT_FETCH_NYI"
		});
	}
	try {
		return self.rolodex.provisionedServices[serviceId].fetchFullContact(
			service.credentials,
			userId,
			self.options,
			function(err, detail) {
				if (err) {
					self.options.logger.warn("[rolodex] Error fetching full contact for", "serviceId", serviceId, "userId", userId, err.stack);
					fullContacts[serviceId][userId].reject(err);
					delete fullContacts[serviceId][userId];
					return callback(null, {
						error: err.message
					});
				}
				self.options.logger.debug("[rolodex] Fetched full contact for", "serviceId", serviceId, "userId", userId);
				fullContacts[serviceId][userId].resolve(detail);
				return callback(null, detail);
			}
		);
	} catch(err) {
		return callback(err);
	}
}

ServicesSession.prototype.fetchForService = function(serviceId, callback) {
	var self = this;
	var service = self.services[serviceId];
	function scheduleFetch(callback) {
/*
		if (service.lastFetchTime && service.lastFetchTime > (Math.floor(Date.now()/1000) - 60) && self.options.test !== true && self.options.ignoreFrequestFetch !== true) {
			return callback(null, {
				error: {
					message: "You can only refetch once per minute.",
					code: "TOO_FREQUENT_REFETCH"
				}
			});
		}
*/
		function finalize(fetching, callback) {
			service.fetching = fetching;
			service.error = false;
			service.contactsFetched = 0;
			service.contactsDropped = 0;
			return self.save(function(err) {
				if (err) return callback(err);
				return callback(null, {
					fetching: true
				});
			});
		}
		if (!self.rolodex.kickq) {
			self._runFetchForService(serviceId, service.credentials, function(err) {
				if (err) {
					self.options.logger.error("[rolodex][fetch-for-service] Finished with error:", err.stack);
					return;
				}
				self.options.logger.debug("[rolodex][fetch-for-service] Finished successfully");
			});
			return finalize(true, callback);
		}
		return self.rolodex.kickq.create("fetch-for-service", {
			sessionID: self.sessionID,
			serviceId: serviceId,
			credentials: service.credentials
		}, {
			delay: 1000	// Delay one second to allow our save to go through before job queue picks it up.
		}, function(err, jobItem) {
			if (err) return callback(err);
			return finalize(jobItem.id, callback);
		});
	}
	if (service.fetching) {
		if (!self.rolodex.kickq) {
			return callback(null, {
				fetching: true
			});
		}
		return self.rolodex.kickq.get(service.fetching, function(err, jobItem) {
			if (err) return callback(err);
			if (jobItem && self.options.debug) {
				self.options.logger.debug("[rolodex][job:fetch-for-service] Existing job:", jobItem);
				self.options.logger.debug("[rolodex][job:fetch-for-service] createTime:", jobItem.createTime, Math.floor((jobItem.createTime - Date.now())/1000));
				self.options.logger.debug("[rolodex][job:fetch-for-service] updateTime:", jobItem.updateTime, Math.floor((jobItem.updateTime - Date.now())/1000));
				self.options.logger.debug("[rolodex][job:fetch-for-service] scheduledFor:", jobItem.scheduledFor, Math.floor((jobItem.scheduledFor - Date.now())/1000));
			}
			// If job is old and seems stale we re-launch it.
			// TODO: The job queue should set status properly so we can detect timed-out jobs.
			if ((Date.now() - jobItem.updateTime) > 60 * 2 * 1000) {	// 2 Minutes
				// TODO: Delete old job.
				self.options.logger.debug("[rolodex][job:fetch-for-service] Job seems stuck. Schedule a new one.");
				jobItem = null;
			}
			if (jobItem && jobItem.state !== "success" && jobItem.state !== "fail") {
				// We already have a job running so we don't schedule another one for now.
				return callback(null, {
					fetching: true
				});
			}
			return scheduleFetch(callback);
		});
	}
	return scheduleFetch(callback);
}

ServicesSession.prototype._runFetchForService = function(serviceId, credentials, callback) {
	var self = this;

	function Service(data) {
		this._data = {};
		for (var key in data) {
			this._data[key] = data[key];
		}
		this._changes = {};
	}
	Service.prototype.set = function(key, value) {
		this._changes[key] = value;
	}
	Service.prototype.get = function(key) {
		if (typeof this._changes[key] !== "undefined") {
			return this._changes[key];
		}
		return this._data[key];		
	}
	Service.prototype.clearChanges = function() {
		this._changes = {};
	}
	Service.prototype.formatChangesForService = function(serviceId) {
		var changes = {};
		changes[serviceId] = this._changes;
		return changes;
	}

	try {

		ASSERT.equal(typeof self.services[serviceId], "object");

		return self.loadContactsForService(serviceId, function(err) {
			if (err) return err;

			var service = new Service(self.services[serviceId]);

			var lastFetchTime = Math.floor(Date.now()/1000);

			function fail(err) {
				service.clearChanges();
				service.set("fetching", false);
				service.set("lastFetchTime", lastFetchTime);
				if (err.code === "ACCESS_TOKEN_EXPIRED") {
					service.set("loggedin", false);
					service.set("logoutReason", "ACCESS_TOKEN_EXPIRED");
					self.options.logger.debug("[rolodex][job:fetch-for-service][" + serviceId + "] Access token expired. User must re-auth.", err.message, credentials);
				} else {
					service.set("error", err.message);
					self.options.logger.error("[rolodex][job:fetch-for-service][" + serviceId + "] Error running job:", err.stack);
				}
				return self.save(service.formatChangesForService(serviceId), callback);
			}

			try {
				return self.rolodex.provisionedServices[serviceId].fetchContacts(
					credentials,
					service,
					self.options,
					function(err) {
						if (err) return fail(err);

						if (service.get("logoutReason") === "ACCESS_TOKEN_EXPIRED") {
							service.set("logoutReason", false);
						}

		    			self.options.logger.debug("[rolodex][job:fetch-for-service][" + serviceId + "] contactsTotal:", service.get("contactsTotal"), " contactsDropped:", service.get("contactsDropped"), " contactsFetched:", service.get("contactsFetched"));
						if (service.get("contactsFetched") !== service.get("contactsTotal")) {
							self.options.logger.warn("[rolodex][job:fetch-for-service][" + serviceId + "] `contactsFetched` (" + service.get("contactsFetched") + ") != `contactsTotal` (" + service.get("contactsTotal") + ")");
						}
						service.set("contactsTotal", service.get("contactsFetched"));
						self.services[serviceId].hCard = service.get("hCard");

						if (fullContacts[serviceId]) {
							for (var contactId in fullContacts[serviceId]) {
								if (!Q.isPending(fullContacts[serviceId][contactId].promise)) {
									delete fullContacts[serviceId][contactId];
								}
							}
						}

						// Generate or sync peerContact ID if already exists.
						function generatePeerContactID() {
							var shasum = CRYPTO.createHash("sha1");
							shasum.update(serviceId + ":" + JSON.stringify(credentials) + ":" + JSON.stringify(self.services[serviceId].hCard) + ":" + Math.random());
							return "peer://" + self.options.hostname + "/" + shasum.digest("hex");
						}
						function ensurePeerContactID(callback) {
							var peerContact = null;
							var peerContactKeys = [];		
							for (var id in self.services) {
								if (self.services[id].hCard) {
									if (self.services[id].hCard.peerContact) {
										peerContact = self.services[id].hCard.peerContact;
									} else {
										peerContactKeys.push(self._getPeerContactsKey(self.services[id].hCard.uid));
									}
								}
							}
							function updatePeerContact(callback) {
								var peerContactKeyVals = [];
								for (var id in self.services) {
									if (id === serviceId && self.services[id].hCard) {
										self.services[id].hCard.peerContact = peerContact;
										service.set("hCard", self.services[id].hCard);
										peerContactKeyVals.push(self._getPeerContactsKey(self.services[id].hCard.uid));
										peerContactKeyVals.push(peerContact);
									}
								}
								if (peerContactKeyVals.length === 0) return callback(null);
							    return self.rolodex.db.mset(peerContactKeyVals, function (err, reply) {
							    	if (err) return callback(err);
									return callback(null);
							    });
							}
							if (!peerContact) {
								if (peerContactKeys.length === 0) {
							    	if (!peerContact) {
							    		peerContact = generatePeerContactID();
				    					self.options.logger.info("[rolodex][job:fetch-for-service][" + serviceId + "] Generated `peerContact` (" + peerContact + ") for the first time for uid:", self.services[serviceId].hCard.uid);							    		
							    	}
									return updatePeerContact(callback);
								}
							    return self.rolodex.db.mget(peerContactKeys, function (err, reply) {
							    	if (err) return callback(err);
							    	if (reply) {
							    		for (var i=0; i<peerContactKeys.length ; i++) {
							    			if (reply[i]) {
							    				var m = peerContactKeys[i].match(/:([^:]*):([^:]*)$/);
							    				if (peerContact && reply[i] !== peerContact) {
							    					// NOTE: We should never get here. If we do, there must have been an intermittent DB connection
							    					//       issue that the client did not detect and properly fail for.
							    					self.options.logger.warn("[rolodex][job:fetch-for-service][" + serviceId + "] `peerContact` (" + reply[i] + ") for service (" + peerContactKeys[i] + ") does not match existing `peerContact` (" + peerContact + ") while processing uid:", self.services[serviceId].hCard.uid);
							    				}
							    				peerContact = reply[i];
							    			}
							    		}
							    	}
							    	if (!peerContact) {
							    		peerContact = generatePeerContactID();
				    					self.options.logger.info("[rolodex][job:fetch-for-service][" + serviceId + "] Generated `peerContact` (" + peerContact + ") for the first time for uid:", self.services[serviceId].hCard.uid);							    		
							    	}
									return updatePeerContact(callback);
							    });
							} else {
								return updatePeerContact(callback);
							}
						}
						return ensurePeerContactID(function(err) {
							if (err) return callback(err);
							self.services[serviceId].lastFetchTime = lastFetchTime;
							service.set("lastFetchTime", lastFetchTime);
							service.set("fetchCount", service.get("fetchCount") + 1);
							return self.saveContactsForService(serviceId, function(err) {
								if (err) return callback(err);
								service.set("error", false);
								service.set("fetching", false);
								return self.save(service.formatChangesForService(serviceId), function(err) {
									if (err) return callback(err);

									var changes = service.formatChangesForService(serviceId);
									for (var name in changes[serviceId]) {
										self.services[serviceId][name] = changes[serviceId][name];
									}

									self.rolodex.emit("service.updated", serviceId, self);

									return callback(null);
								});
							});
						});
					}
				);
			} catch(err) {
				return fail(err);
			}
		});

	} catch(err) {
		return callback(err);
	}
}

module.exports = Services;
