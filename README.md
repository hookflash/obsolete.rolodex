*Status: DEV*

Rolodex for Open Peer
=====================

Having a distributed and secure communication system like [Open Peer](http://openpeer.org/) is quite useless if you have nobody to talk with.

This rolodex SDK encompasses the following:

  * Integration with [passport](http://passportjs.org/) for authentication with 120+ services.
  * Contact federation for any service with a *contacts* API (that we have a plugin for).
  * [connect](https://github.com/senchalabs/connect) middleware to service client requests.


Example
-------

    cd example
    make install
    # Configure services in `rolodex.config.json` (see 'Configuration' below)
    make run


Usage
-----

Install:

    npm install openpeer-rolodex

When you first run your application, required dependencies for any configured
service will be automatically installed. You can also install these manually:

    cd ./lib/plugin/<service>
    npm install

Integrate:

  * Server-side - See `./example/server.js`.
  * Client-side - See `./example/ui/app.js`.


Configuration
-------------

For each service you want to integrate with you need to:

  1. Create an application on the service.
  2. Configure the service in `rolodex.config.json`.

The `rolodex.config.json` file must be structured as follows:

    {
        "routes": {
            # These are the defaults and may be omitted.
            authSuccess: "/",
            authFail: "/",
            auth: "/.openpeer-rolodex/auth",
            authCallback: "/.openpeer-rolodex/callback",
            services: "/.openpeer-rolodex/services",
            contacts: "/.openpeer-rolodex/contacts"
        },
        "services": [
            // One or more of the service config objects below.
        ]
    }


### [GitHub](https://github.com/)

Create application here https://github.com/settings/applications
with callback URL `http://localhost:8080/.openpeer-rolodex/callback/github`.

    {
        "name": "github",
        "passport": {
            "clientID": "<Client ID>",
            "clientSecret": "<Client Secret>"
        }
    }


License
=======

[BSD-2-Clause](http://opensource.org/licenses/BSD-2-Clause)
