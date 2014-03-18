
const ASSERT = require("assert");
const SERVER = require("../server");
const REQUEST = require("request");

var TOKEN = "<TOKEN>";

// curl -X POST -d @/pinf2/hookflash/projects/github.com+openpeer+hcs-instance-v1/projects/github.com+openpeer+rolodex/openpeer/tests/contacts-get-request.json http://rolodex-v1-beta-1-i.hcs.io/.openpeer-rolodex/rolodex-contacts-get --header "Content-Type:application/json"

describe("api", function() {

    this.timeout(30 * 1000);

    if (TOKEN === "<TOKEN>") {
        throw new Error("<TOKEN> must be replaced with a valid rolodex token from http://opjsdemostage-hookflash.dotcloud.com/");
    }

    var serverInfo = null;

    it("start server", function(done) {
        return SERVER.main({
            test: true
        }, function(err, info) {
            if (err) return done(err);
            serverInfo = info;
            return done(null);
        });
    });

    it("/rolodex-access", function(done) {

        return REQUEST.post({
            method: "POST",
            url: "http://localhost:" + serverInfo.port + "/rolodex-access",
            body: JSON.stringify({
              "request": {
                "$domain": "idprovider-javascript.hookflash.me",
                "$appid": "xyz123",
                "$id": "abd23",
                "$handler": "rolodex",
                "$method": "rolodex-access",
                // TODO: Implement security.
                //"clientNonce": "ed585021eec72de8634ed1a5e24c66c2",
                "identity": {
                  // TODO: Implement security.
                  //"accessToken": "a913c2c3314ce71aee554986204a349b",
                  //"accessSecretProof": "b7277a5e49b3f5ffa9a8cb1feb86125f75511988",
                  //"accessSecretProofExpires": 43843298934,
                  // TODO: Implement grant.
                  //"uri": "identity://domain.com/alice",
                  //"provider": "domain.com"
                },
                "rolodex": {
                   "serverToken": TOKEN
                }
                //"agent": {
                //  "userAgent": "hookflash/1.0.1001a (iOS/iPad)",
                //  "name": "hookflash",
                //  "image": "https://hookflash.com/brandsquare.png",
                //  "url": "https://hookflash.com/agentinfo/"
                //},
                // TODO: Implement grant.
                //"grant": {
                //  "$id": "de0c8c10d692bc91c1a551f57a50d2f97ef67543"
                //}
              }
            }),
            headers: {
                "Content-Type": "application/json"
            }
        }, function (err, response, body) {
            if (err) return done(err);

            return done(null);
        });
    });

    function doFetchContacts(options, callback) {

//        console.log("fetching", options);

        return REQUEST.post({
            method: "POST",
            url: "http://localhost:" + serverInfo.port + "/rolodex-contacts-get",
            body: JSON.stringify({
              "request": {
                "$domain": "idprovider-javascript.hookflash.me",
                "$appid": "xyz123",
                "$id": "abd23",
                "$handler": "rolodex",
                "$method": "rolodex-contacts-get",
                // TODO: Implement security.
                //"clientNonce": "ed585021eec72de8634ed1a5e24c66c2",
                "rolodex": {
                   "serverToken": TOKEN,
                   // TODO: Implement security.
                   //"accessToken": "a913c2c3314ce71aee554986204a349b",
                   //"accessSecretProof": "b7277a5e49b3f5ffa9a8cb1feb86125f75511988",
                   //"accessSecretProofExpires": 43843298934,
                   "version": options.version || false,
                   "refresh": options.refresh || false
                 }
              }
            }),
            headers: {
                "Content-Type": "application/json"
            }
        }, function (err, response, body) {
            if (err) return callback(err);

            var result = JSON.parse(body).result;

            if (result.error && result.error.$id === 500) {
                return callback(new Error(JSON.stringify(result)));
            }

            return callback(null, result);
        });
    }

    var originalVersion = null;

    it("/rolodex-contacts-get (no `version`) with `refresh` true should fetch latest contacts from service", function(done) {
        return doFetchContacts({
            refresh: true
        }, function(err, result) {
          if (err) return done(err);

          ASSERT.equal(typeof result.rolodex.version, "number");

          originalVersion = result.rolodex.version;

          // We expect `result.rolodex.updateNext` to be 10 seconds from now
          // as the server is fetching contacts
          ASSERT.equal((result.rolodex.updateNext - Math.round(Date.now()/1000)), 10);

          return setTimeout(function() {
              return doFetchContacts({
                  refresh: false
              }, function(err, result) {
                if (err) return done(err);

                ASSERT.equal(typeof result.rolodex.version, "number");

                ASSERT.equal(result.identities.identity.length > 0, true);

                return done();
              });
          }, 5 * 1000);
        });
    });

    var latestVersion = null;

    it("/rolodex-contacts-get (no `refresh`) with `version` that does not exist should return latest", function(done) {
        return doFetchContacts({
            version: "version-that-does-not-exist"
        }, function(err, result) {
          if (err) return done(err);

          ASSERT.deepEqual(result.error, {
            "$id": 409,
            "#text": "Conflict"
          });

          return doFetchContacts({
              version: false
          }, function(err, result) {
            if (err) return done(err);

            latestVersion = result.rolodex.version;

            ASSERT.equal(result.identities.identity.length > 0, true);

            return done();
          });
        });
    });

    it("/rolodex-contacts-get (no `refresh`) with `version` that is latest should return empty delta", function(done) {
        return doFetchContacts({
            version: latestVersion
        }, function(err, result) {
          if (err) return done(err);

          ASSERT.equal(result.rolodex.version, latestVersion);
          ASSERT.deepEqual(result.identities.identity, {});

          return done();
        });
    });

    it("/rolodex-contacts-get (no `refresh`) with previous `version` should return delta", function(done) {
      return doFetchContacts({
          version: originalVersion
      }, function(err, result) {
        if (err) return done(err);

        ASSERT.equal(result.rolodex.version, latestVersion);

        ASSERT.deepEqual(result.identities.identity, [
            {
                "$disposition": "remove",
                "uri": "identity://github.com/1",
                "provider": "github.com"
            },
            {
                "$disposition": "update",
                "uri": "identity://github.com/3",
                "provider": "github.com",
                "name": "c",
                "profile": "",
                "vprofile": "",
                "feed": "",
                "avatars": {
                    "avatar": {
                        "url": "p3"
                    }
                }
            }
        ]);

        return done();
      });
    });

    it("stop server", function(done) {
        return serverInfo.server.close(function() {
            return done(null);
        });
    });
});
