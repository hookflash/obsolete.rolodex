
const ASSERT = require("assert");
const PASSPORT_TWITTER = require("passport-twitter");
const TWITTER = require("mtwitter");



exports.init = function(rolodex, passport, config, options, callback) {

	try {

		ASSERT.equal(typeof config.passport.consumerKey, "string");
		ASSERT.equal(typeof config.passport.consumerSecret, "string");

	    passport.use(new PASSPORT_TWITTER.Strategy({
	    	consumerKey: config.passport.consumerKey,
		    consumerSecret: config.passport.consumerSecret,
		    callbackURL: config.callbackURL
		}, function(accessToken, accessTokenSecret, profile, done) {
	        return done(null, {
	            "twitter": {
	                "id": profile.id,
	                "username": profile.username,
	                "accessToken": accessToken,
	                "accessTokenSecret": accessTokenSecret
	            }
	        });
	    }));

	    function getAPI(passportSession) {

	    	ASSERT.equal(typeof passportSession, "object");

			return new TWITTER({
				consumer_key: config.passport.consumerKey,
				consumer_secret: config.passport.consumerSecret,
				access_token_key: passportSession.accessToken,
				access_token_secret: passportSession.accessTokenSecret
			});
		}

		return callback(null, {
			fetchContacts: function(passportSession, service, options, done) {

	    		if (service.fetching) return done(null);

	    		if (service.contactsTotal > 0 && options.refetch !== true) return done(null);

	    		function callback(err) {
	    			service.fetching = false;
	    			return done.apply(null, arguments);
	    		}

	    		var twitter = getAPI(passportSession);

		    	service.fetching = true;

		    	function ensureUserInfo(callback) {
		    		if (service.username !== null && options.refetch !== true) {
		    			return callback(null);
		    		}
		    		console.log("[rolodex][twitter] Fetch user info for: " + passportSession.username);
					twitter.get("users/show.json", {
						user_id: passportSession.id
					}, function(err, user) {
						if (err) return callback(err);
						/*
						{
						  "profile_sidebar_fill_color": "F8FCF2",
						  "profile_sidebar_border_color": "547980",
						  "profile_background_tile": true,
						  "name": "Ryan Sarver",
						  "profile_image_url": "http://a0.twimg.com/profile_images/1777569006/image1327396628_normal.png",
						  "created_at": "Mon Feb 26 18:05:55 +0000 2007",
						  "location": "San Francisco, CA",
						  "follow_request_sent": false,
						  "profile_link_color": "547980",
						  "is_translator": false,
						  "id_str": "795649",
						  "default_profile": false,
						  "contributors_enabled": true,
						  "favourites_count": 3162,
						  "url": null,
						  "profile_image_url_https": "https://si0.twimg.com/profile_images/1777569006/image1327396628_normal.png",
						  "utc_offset": -28800,
						  "id": 795649,
						  "profile_use_background_image": true,
						  "listed_count": 1586,
						  "profile_text_color": "594F4F",
						  "lang": "en",
						  "followers_count": 276334,
						  "protected": false,
						  "notifications": true,
						  "profile_background_image_url_https": "https://si0.twimg.com/profile_background_images/113854313/xa60e82408188860c483d73444d53e21.png",
						  "profile_background_color": "45ADA8",
						  "verified": false,
						  "geo_enabled": true,
						  "time_zone": "Pacific Time (US & Canada)",
						  "description": "Director, Platform at Twitter. Detroit and Boston export. Foodie and over-the-hill hockey player. @devon's lesser half",
						  "default_profile_image": false,
						  "profile_background_image_url": "http://a0.twimg.com/profile_background_images/113854313/xa60e82408188860c483d73444d53e21.png",
						  "status": {
						    "coordinates": null,
						    "favorited": false,
						    "truncated": false,
						    "created_at": "Sat Aug 25 19:33:11 +0000 2012",
						    "retweeted_status": {
						      "coordinates": null,
						      "favorited": false,
						      "truncated": false,
						      "created_at": "Sat Aug 25 19:20:36 +0000 2012",
						      "id_str": "239442171466493953",
						      "entities": {
						        "urls": [
						          {
						            "expanded_url": "http://nbcnews.to/NtkRTJ",
						            "url": "http://t.co/f8ivBrVd",
						            "indices": [
						              102,
						              122
						            ],
						            "display_url": "nbcnews.to/NtkRTJ"
						          }
						        ],
						        "hashtags": [
						 
						        ],
						        "user_mentions": [
						 
						        ]
						      },
						      "in_reply_to_user_id_str": null,
						      "contributors": null,
						      "text": "Neil Armstrong has died at the age of 82 from complications from heart operations he had 3 weeks ago. http://t.co/f8ivBrVd",
						      "retweet_count": 112,
						      "in_reply_to_status_id_str": null,
						      "id": 239442171466493953,
						      "geo": null,
						      "retweeted": false,
						      "possibly_sensitive": false,
						      "in_reply_to_user_id": null,
						      "place": null,
						      "in_reply_to_screen_name": null,
						      "source": "web",
						      "in_reply_to_status_id": null
						    },
						    "id_str": "239445335481647105",
						    "entities": {
						      "urls": [
						        {
						          "expanded_url": "http://nbcnews.to/NtkRTJ",
						          "url": "http://t.co/f8ivBrVd",
						          "indices": [
						            115,
						            135
						          ],
						          "display_url": "nbcnews.to/NtkRTJ"
						        }
						      ],
						      "hashtags": [
						 
						      ],
						      "user_mentions": [
						        {
						          "name": "NBC News",
						          "id_str": "14173315",
						          "id": 14173315,
						          "indices": [
						            3,
						            11
						          ],
						          "screen_name": "NBCNews"
						        }
						      ]
						    },
						    "in_reply_to_user_id_str": null,
						    "contributors": null,
						    "text": "RT @NBCNews: Neil Armstrong has died at the age of 82 from complications from heart operations he had 3 weeks ago. http://t.co/f8ivBrVd",
						    "retweet_count": 112,
						    "in_reply_to_status_id_str": null,
						    "id": 239445335481647105,
						    "geo": null,
						    "retweeted": false,
						    "possibly_sensitive": false,
						    "in_reply_to_user_id": null,
						    "place": null,
						    "in_reply_to_screen_name": null,
						    "source": "<a href=\"http://twitter.com\" rel=\"nofollow\">Twitter for  iPhone</a>",
						    "in_reply_to_status_id": null
						  },
						  "statuses_count": 13728,
						  "friends_count": 1780,
						  "following": true,
						  "show_all_inline_media": true,
						  "screen_name": "rsarver"
						}
						*/

						// TODO: Add this as a full contact.

						var firstLoad = (service.username === null) ? true : false;

						service.username = user.screen_name;
						service.contactsTotal = user.friends_count;

						if (firstLoad) {
							return service.load(callback);
						} else {
							return callback(null);
						}
					});
					return twitter.rest.drain();
		    	}

		    	return ensureUserInfo(function(err) {
		    		if (err) return callback(err);

		    		if (service.contactsFetched === service.contactsTotal && options.refetch !== true) return callback(null);

		    		console.log("[rolodex][twitter] Fetch contacts for: " + service.username);

		    		var existingContacts = {};
		    		for (var contactId in service.contacts) {
		    			existingContacts[contactId] = true;
		    		}

		    		function fetchPage(cursor, callback) {
						twitter.get("friends/list.json", {
							user_id: passportSession.id,
							cursor: cursor,
							skip_status: true,
							include_user_entities: false
						}, function(err, res) {
							if (err) return callback(err);
							/*
							{
								users: [],
								next_cursor: 1349141835127868000,
								next_cursor_str: '1349141835127867854',
								previous_cursor: 0,
								previous_cursor_str: '0'
							}
							*/
							res.users.forEach(function(user) {
								/*
								{
									id: 533884891,
									id_str: '533884891',
									name: 'Meteor',
									screen_name: 'meteorjs',
									location: '',
									url: 'http://meteor.com/',
									description: 'Meteor is an open-source platform for building top-quality web apps in a fraction of the time, whether you\'re an expert developer or just getting started.',
									protected: false,
									followers_count: 17871,
									friends_count: 28,
									listed_count: 530,
									created_at: 'Fri Mar 23 04:54:21 +0000 2012',
									favourites_count: 11,
									utc_offset: null,
									time_zone: null,
									geo_enabled: false,
									verified: false,
									statuses_count: 651,
									lang: 'en',
									contributors_enabled: false,
									is_translator: false,
									profile_background_color: '131516',
									profile_background_image_url: 'http://a0.twimg.com/images/themes/theme14/bg.gif',
									profile_background_image_url_https: 'https://si0.twimg.com/images/themes/theme14/bg.gif',
									profile_background_tile: true,
									profile_image_url: 'http://a0.twimg.com/profile_images/2080420398/twitter-rock128_normal.png',
									profile_image_url_https: 'https://si0.twimg.com/profile_images/2080420398/twitter-rock128_normal.png',
									profile_link_color: '009999',
									profile_sidebar_border_color: 'EEEEEE',
									profile_sidebar_fill_color: 'EFEFEF',
									profile_text_color: '333333',
									profile_use_background_image: true,
									default_profile: false,
									default_profile_image: false,
									following: true,
									follow_request_sent: false,
									notifications: false
								}
								*/

								delete existingContacts[user.screen_name];

								service.contacts[user.screen_name] = {
									"display": user.name,
									"image": user.profile_image_url || null
								};
							});

							service.contactsFetched = Object.keys(service.contacts).length;

							if (res.next_cursor) {
								return fetchPage(res.next_cursor, callback);
							}

							return callback(null);
						});
						return twitter.rest.drain();
		    		}

		    		return fetchPage(-1, function(err) {
		    			if (err) return callback(err);

			    		for (var contactId in existingContacts) {
			    			delete service.contacts[contactId];
			    		}

						if (service.contactsFetched !== service.contactsTotal) {
							console.warn("[rolodex][twitter] ERROR: `contactsFetched` (" + service.contactsFetched + ") != `contactsTotal` (" + service.contactsTotal + ")");
						}

						return service.save(function(err) {
							if (err) return callback(err);

							// All done.
							return callback(null);
						});		    			
		    		});
				});
			}
		});

	} catch(err) {
		return callback(err);
	}
}
