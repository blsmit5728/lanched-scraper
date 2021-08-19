// ==UserScript==
// @id             iitc-plugin-portal-scraper-Lanched@Lanched
// @name           IITC plugin: scrape portals' locations
// @category       Misc
// @version        0.3.2
// @namespace      https://github.com/jonatkins/ingress-intel-total-conversion
// @updateURL      https://github.com/blsmit5728/lanched-scraper/raw/master/portal-scraper.user.js
// @downloadURL    https://github.com/blsmit5728/lanched-scraper/raw/master/portal-scraper.user.js
// @description    Scrapes all portals' locations
// @include        https://*.ingress.com/intel*
// @include        https://*.ingress.com/mission/*
// @include        https://mission-author-dot-betaspike.appspot.com/edit?id=*
// @include        https://wayfarer.nianticlabs.com/review*
// @match          https://*.ingress.com/intel*
// @match          https://*.ingress.com/mission/*
// @match          https://mission-author-dot-betaspike.appspot.com/edit?id=*
// @match          https://wayfarer.nianticlabs.com/review*
// @run-at         document-start
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
    // ensure plugin framework is there, even if iitc is not yet loaded
    if (typeof window.plugin !== 'function') window.plugin = function() {};

window.plugin.LanchedScraper = function(){};

Object.assign(window.plugin.LanchedScraper, {

    LS_SETTINGS_KEY: 'plugin-lanched-scraper-settings',

    options: {
        ACTIVE: true,
    },

    sent: {},

    setup: function(site)
    {
        if(!site)
            site = 'intel';

        this.options = this.getSavedOptions();
        var isActive = this.options.ACTIVE;

        var methods = {},
            rand    = Math.random();

        methods['open'                    + rand] = XMLHttpRequest.prototype.open;
        methods['processIntelEntities'    + rand] = this.processIntelEntities   .bind(this);
        methods['processMissionPOIs'      + rand] = this.processMissionPOIs     .bind(this);
        methods['processMissionClusters'  + rand] = this.processMissionClusters .bind(this);
        methods['processOPRNearbyPortals' + rand] = this.processOPRNearbyPortals.bind(this);

        Object.assign(XMLHttpRequest.prototype, methods);

        XMLHttpRequest.prototype.open = function(method, url, async, user, pass)
        {
            isActive && this.addEventListener('readystatechange', function ()
            {
                if(this.readyState === 4 && this.status === 200)
                {
                    if(site === 'intel' && this.responseURL.match(/https?:\/\/(?:(?:www|intel)\.)?ingress\.com\/r\/(.*)/))
                    {
                        if(RegExp.$1 === 'getEntities')
                            this['processIntelEntities' + rand](JSON.parse(this.responseText).result);
                    }

                    if(site === 'missions')
                    {
                        switch(this.responseURL.substr(60))
                        {
                            case 'getClusterDetails':
                            case 'searchPOIs':
                                this['processMissionPOIs' + rand](JSON.parse(this.responseText));
                                break;

                            case 'getClusters':
                                this['processMissionClusters' + rand](JSON.parse(this.responseText));
                                break;
                        }
                    }

                    if(site === 'opr' && this.responseURL.match(/\/vault\/review$/))
                    {
                        this['processOPRNearbyPortals' + rand](JSON.parse(this.responseText));
                    }
                }
            }, false);

            this['open' + rand](method, url, async, user, pass);
        };

        if(site !== 'intel')
            return;


        $('<style>')
            .prop('type', 'text/css')
            .prop('id', 'lanched-scraper-css')
            .html(
                  'body.privacy_active .lanched-scraper-toolbox-opt {display: none !important;}'
                + '.lanched-scraper-dialog-alert {float: left; margin: 4px;}'
            )
            .appendTo('head');

        $('<a>')
            .addClass('lanched-scraper-toolbox-opt')
            .prop('title', 'LSO')
            .text('LSO')
            .click(this.opt.bind(this))
            .appendTo('#toolbox');
    },

    processIntelEntities: function(data)
    {
        var map = data.map,
            portals = {};

        for(var key in map)
        {
            if('error' in map[key])
                continue;

            for(var i = 0, list = map[key].gameEntities, ln = list.length, entity; i < ln; i++)
            {
                entity = list[i];

                if(entity[2][0] === 'p')
                    portals[entity[0]] = [entity[2][2], entity[2][3]]; // {guid: [lat, lng]}
            }
        }

        this.sendData(portals);
    },

    processMissionPOIs: function(data)
    {
        let portals = {};

        for(let entry of data.pois)
            if(entry.type === 'PORTAL')
                portals[entry.guid] = [
                    entry.location.latitude  * 1E6,
                    entry.location.longitude * 1E6
                ];

        this.sendData(portals);
    },

    processMissionClusters: function(data)
    {
        let portals = {};

        for(let entry of data.clusters)
            if(entry.portalCount === 1 && entry.the_only_poi.type === 'PORTAL')
                portals[entry.the_only_poi.guid] = [
                    entry.the_only_poi.location.latitude  * 1E6,
                    entry.the_only_poi.location.longitude * 1E6
                ];

        this.sendData(portals);
    },

    processOPRNearbyPortals: function(data)
    {
        if(!data.result || !data.result.nearbyPortals || !data.result.nearbyPortals.length)
            return;

        let portals = {};

        for(let entry of data.result.nearbyPortals)
            portals[entry.guid] = [
                entry.lat * 1E6,
                entry.lng * 1E6
            ];

        this.sendData(portals);
    },

    sendData: function(portals)
    {
        for(var guid in portals)
            if(guid in this.sent)
                delete portals[guid];

        if(!Object.keys(portals).length)
            return;

        console.log('Lanched Scraper:', Object.keys(portals).length, portals);

        fetch('https://crowd.lanched.ru/push.php', {
            'credentials': 'omit',
            'method': 'POST',
            'mode'  : 'cors',
            'body'  : JSON.stringify(portals),
        }).then(response => response.json())
          .then(data => this.handleResponse(data));

        Object.assign(this.sent, portals);
    },

    handleResponse: function(data)
    {
        if(data && data.new)
            console.log('Lanched Scraper:', data.new, 'new portals found');
    },

    opt: function()
    {
        var html = '<div class="lanched-scraper-options">'
                + '<div class="lanched-scraper-options-row"><label><input type="checkbox" name="ACTIVE" ' + (this.options.ACTIVE ? ' checked' : '') + ' /> Activate the scraper</label></div>'
            + '</div>';

        dialog({
            html: html,
            id: 'plugin-lanched-scraper-options',
            dialogClass: 'lanched-scraper-dialog',
            title: 'Lanched Scraper Options',
            width: 300,
        });

        $('.lanched-scraper-options input').on('change', this.settings.bind(this));

        $('.lanched-scraper-dialog .ui-dialog-buttonset').prepend('<p class="lanched-scraper-dialog-alert"></p>');
    },

    getSavedOptions: function()
    {
        var saved = localStorage[this.LS_SETTINGS_KEY];

        if(saved)
        {
            try
            {
                saved = JSON.parse(saved);
            }
            catch (e)
            {
                delete localStorage[this.LS_SETTINGS_KEY];
            }
        }

        return Object.assign(this.options, saved);
    },

    saveOptions: function()
    {
        localStorage[this.LS_SETTINGS_KEY] = JSON.stringify(this.options);
    },

    settings: function($event)
    {
        var element = $event.target;
        var value = (element.type === 'checkbox')
            ?  element.checked
            : (element.value | 0);

        this.options[element.name] = value;
        this.saveOptions();
        this.optAlert('Saved.');
        console.log('Lanched Scraper: option saved', element.name, value, this.options);
    },

    optAlert: function(message)
    {
        $('.lanched-scraper-dialog-alert').text(message).show().delay(2000).fadeOut();
    },

});

var setup = window.plugin.LanchedScraper.setup.bind(window.plugin.LanchedScraper);

    // PLUGIN END //////////////////////////////////////////////////////////


    setup.info = plugin_info; //add the script info data to the function as a property
    if (!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);

    // if IITC has already booted, immediately run the 'setup' function
    if (window.iitcLoaded && typeof setup === 'function') setup();
    else if(document.location.host === 'wayfarer.nianticlabs.com') setup('opr');
    else if(document.location.host === 'mission-author-dot-betaspike.appspot.com') setup('missions');
} // wrapper end

// inject code into site context
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = {
    version: GM_info.script.version,
    name: GM_info.script.name,
    description: GM_info.script.description
};
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
