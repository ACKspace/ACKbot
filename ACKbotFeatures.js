"use strict";

global.spaceAPI = null;
global.github = null;

// TODO: remove after restarting the bot
/*
global.connection = {
    name     : "ACKbot",
    server   : "irc.freenode.org",
    port     : 6667,
    channels : "#ACKspace,#ACKspaceBots"
};
*/

var request = require( "request" ); //alternative is 'http'
var xmlParser = null;

function fetchSpaceAPI( _callback )
{
    if ( typeof _callback !== "function" )
        return false;

    // Check if we recently fetched the spaceAPI
    if ( global.spaceAPI && global.spaceAPI.ext_last_fetched > Date.now() - 20000 )
    {
        _callback( global.spaceAPI );
        return true;
    }

    console.log( "* fetching new spaceAPI data" );
    request('https://ackspace.nl/spaceAPI/', function( _error, _response, _body )
    {
        if ( _error || _response.statusCode !== 200 )
            return;

        // Parse spaceAPI and set a last fetched timestamp
        global.spaceAPI = JSON.parse( _body );
        global.spaceAPI.ext_last_fetched = Date.now();
        _callback( global.spaceAPI );
    } );

    return true;
}

function fetchWikiData( _callback )
{
    if ( typeof _callback !== "function" )
        return false;

    if ( !xmlParser )
        return false;

    var wiki = { newPages : null, lastEdit : null };


    console.log( "* fetching new wiki data" );
    request( "https://ackspace.nl/w/index.php?title=Special:NewPages&feed=atom&hideredirs=1&limit=1", function( _error, _response, _body )
    {
        if ( _error || _response.statusCode !== 200 )
            return;

        // Parse xml feed
        // TODO: and set a last fetched timestamp
        xmlParser.parseString( _body, function( _err, _result )
        {
            // Assign parsed object
            wiki.newPages = _result.feed || {};
            // Invoke callback if other field is already done
            if ( wiki.lastEdit )
                _callback( wiki );
        } );
        //global.spaceAPI.ext_last_fetched = Date.now();
    } );

    request( "https://ackspace.nl/w/api.php?hidebots=1&days=99&hideminor=1&limit=1&action=feedrecentchanges&feedformat=atom", function( _error, _response, _body )
    {
        if ( _error || _response.statusCode !== 200 )
            return;

        // Parse xml feed
        // TODO: and set a last fetched timestamp
        xmlParser.parseString( _body, function( _err, _result )
        {
            // Assign parsed object
            wiki.lastEdit = _result.feed || {};
            // Invoke callback if other field is already done
            if ( wiki.newPages )
                _callback( wiki );
        } );
        //global.spaceAPI.ext_last_fetched = Date.now();
    } );

    return true;
}

function fetchGithubData( _callback )
{
    if ( typeof _callback !== "function" )
        return false;

    // Check if we recently fetched the spaceAPI
    if ( global.github && global.github.ext_last_fetched > Date.now() - 20000 )
    {
        _callback( global.github );
        return true;
    }

    console.log( "* fetching new github data" );
    request(
    {
	headers: { "User-Agent": "Node.js" },
	uri: 'https://api.github.com/orgs/ackspace/events',
	method: 'GET'
    }, function( _error, _response, _body )
    {
        if ( _error || _response.statusCode !== 200 )
	{
	    console.log( "failed", _response );
            return;
	}

        // Parse spaceAPI and set a last fetched timestamp
        global.github = JSON.parse( _body );
        global.github.ext_last_fetched = Date.now();
        _callback( global.github );
    } );

    return true;
}


function getSimpleDate( _date )
{
    var currentDate = new Date();
    var pastDate = new Date( _date );

    // Can be negative if year is positive
    var years = currentDate.getFullYear() - pastDate.getFullYear();
    var months = currentDate.getMonth() - pastDate.getMonth();
    var days = currentDate.getDate() - pastDate.getDate();
    var hours = currentDate.getHours() - pastDate.getHours();
    var minutes = currentDate.getMinutes() - pastDate.getMinutes();

    if ( minutes < 0 )
    {
        hours--;
        minutes += 60;
    }
    if ( hours < 0 )
    {
        days--;
        hours += 24;
    }
    if ( days < 0 )
    {
        months--;
        // TODO: determine correct number of days between the two dates
        days += 30;
    }
    if ( months < 0 )
    {
        years--;
        months += 12;
    }

    if ( years < 0 )
        return "some future time";

    if ( years )
    {
        // Almost..
        if ( months > 9 )
            years++;

        if ( months < 3 || months > 9 )
            return "about " + years + " year" + ( years === 1 ? "" : "s" );
        return "more than " + years + " year" + ( years === 1 ? "" : "s" );
    }

    if ( months )
    {
        // Almost..
        if ( days > 25 )
            months++;

        if ( days < 5 || days > 25 )
            return "about " + months + " month" + ( months === 1 ? "" : "s" );
        return "more than " + months + " month" + ( months === 1 ? "" : "s" );
    }

    if ( days )
    {
        var weeks = days / 7 | 0;
        var modulo = days % 7;

        // Almost..
        if ( modulo > 4 )
            weeks++;

        if ( weeks )
        {
            if ( modulo < 2 || modulo > 4 )
                return "about " + weeks + " week" + ( weeks === 1 ? "" : "s" );
            return "more than " + weeks + " week" + ( weeks === 1 ? "" : "s" );
        }

        // Almost..
        if ( hours > 20 )
            days++;

        if ( hours < 4 || hours > 20 )
            return "about " + days + " day" + ( days === 1 ? "" : "s" );
        return "more than " + days + " day" + ( days === 1 ? "" : "s" );
    }

    if ( hours )
    {
        // Almost..
        if ( minutes > 50 )
            hours++;

        if ( minutes < 10 || minutes > 50 )
            return "about " + hours + " hour" + ( hours === 1 ? "" : "s" );
        return "more than " + hours + " hour" + ( hours === 1 ? "" : "s" );
    }

    if ( minutes )
        return "about " + minutes + " minute" + ( minutes === 1 ? "" : "s" );

    return "just moments";
}



exports.ACKbotFeatures = {};
exports.ACKbotFeatures.findCommand = function( _request, _filter )
{
    var command;
    var keys = Object.keys( this.commands );
    for ( var n = 0; n < keys.length; n++ )
    {
        command = this.commands[ keys[ n ] ];

        if ( !_request.match( command.name ) )
            continue;

        if ( !command.type.match( _filter ) )
            continue;

        // Match!
        return command.method.bind( this );
    }

    // Nothing found
    return undefined;
};

exports.ACKbotFeatures.commands = [
    {
        name : "help",
        description : "displays the text you're looking at",
        type : "irc",
        method : function( _params )
        {
            // Always return help privately
            this.commands.filter( function( _command )
            {
                if ( !_command.description )
                    return false;

                if ( _command.type !== "irc" )
                    return false;

                return true;
            } ).forEach( function( _command )
            {
                console.log( _command );
                global.responseQueue.push( { type : _params.type, target : _params.source.split( "!" )[ 0 ], data : ":\u0002" + _command.name + "\u0002:  " + _command.description } );
            } );

            return { type : _params.type, target : _params.source.split( "!" )[ 0 ], data : ":List of commands:" };
        }
    },
    {
        name : "about",
        description : "Shows about information",
        type : "irc",
        method : function( _params )
        {
            // Always return about text privately
            //global.responseQueue.push( { type : _params.type, target : _params.source.split( "!" )[ 0 ], data : ":\u0002" + _command.name + "\u0002:  " + _command.description } );
            global.responseQueue.push( { type : _params.type, target : _params.source.split( "!" )[ 0 ], data : ":This bot is used for providing in-channel SpaceAPI and other information," } );
            global.responseQueue.push( { type : _params.type, target : _params.source.split( "!" )[ 0 ], data : ":and to provide semi-realtime logs for e-readers (Currently at <http://oyo.glitchentertainment.nl:8000>)." } );
            global.responseQueue.push( { type : _params.type, target : _params.source.split( "!" )[ 0 ], data : ":This bot is written as a node.js application with a command module that is hot-pluggable." } );
            global.responseQueue.push( { type : _params.type, target : _params.source.split( "!" )[ 0 ], data : ":Type !help for a list of commands." } );

            return { type : _params.type, target : _params.source.split( "!" )[ 0 ], data : ":About " + global.connection.name + ":" };
        }
    },
    {
        name : "clearlogs",
        description : null,
        type : "irc",
        method : function( _params )
        {
            console.log( _params.data );
            global.logEntries = [];

            // Always return help privately
            return { type : _params.type, target : _params.source.split( "!" )[ 0 ], data : ":OK" };
        }
    },
    {
        name : /state|status/,
        description : "displays spaceAPI space state",
        type : "irc",
        method : function( _params )
        {
            var response = {};

            if ( _params.target === global.connection.name )
                response.target = _params.source.split( "!" )[ 0 ];
            else
                response.target = _params.target;

            response.type = _params.type;

            fetchSpaceAPI( function( _spaceAPI )
            {

                response.data = ":" + _spaceAPI.state.message + " since " + new Date( _spaceAPI.state.lastchange * 1000 );
                global.responseQueue.push( response );
            } );

            return true;
        }
    },
    {
        name : "temp",
        description : "displays spaceAPI temperature sensor info",
        type : "irc",
        method : function( _params )
        {
            var target, type;
            var response = {};

            if ( _params.target === global.connection.name )
                target = _params.source.split( "!" )[ 0 ];
            else
                target = _params.target;

            type = _params.type;

            fetchSpaceAPI( function( _spaceAPI )
            {

                var sensors = _spaceAPI.sensors || {};

                if ( !sensors.temperature || !sensors.temperature.length )
                {
                    global.responseQueue.push( { target : target, type : type, data : ":No temperature sensor data" } );
                    return;
                }

                // Add all temperature sensors to the queue
                sensors.temperature.forEach( function( _temp )
                {
                    var data;
                    //_temp.unit = "\u00B0C";
                    if ( !_temp.value && _temp.value !== 0 )
                        _temp.value = "unknown";
                    data = ":" + ( _temp.description || _temp.location || _temp.name ) + " value is " + _temp.value + _temp.unit + " at " + new Date( _temp.ext_lastchange * 1000 );

                    global.responseQueue.push( { target : target, type : type, data : data } );
                } );
            } );
            return true;
        }
    },
    {
        name : "locate",
        description : "find the whereabouts of the beacon",
        type : "irc",
        method : function( _params )
        {
            var target, type;
            var response = {};

            if ( _params.target === global.connection.name )
                target = _params.source.split( "!" )[ 0 ];
            else
                target = _params.target;

            type = _params.type;

            fetchSpaceAPI( function( _spaceAPI )
            {

                var sensors = _spaceAPI.sensors || {};

                if ( !sensors.beacon || !sensors.beacon.length )
                {
                    global.responseQueue.push( { target : target, type : type, data : ":No beacon sensor data" } );
                    return;
                }

                // Add all temperature sensors to the queue
                //sensors.beacon.forEach( function( _beacon )
                var _beacon = sensors.beacon[ 0 ];
                {
                    var geoRequest = "https://maps.googleapis.com/maps/api/geocode/json?latlng=" + _beacon.location.lat + "," + _beacon.location.lon;
                    //var data = ":" + ( _beacon.name ) + " is located near " + _beacon.location.lat + "," + _beacon.location.lon + " at " + new Date( _beacon.ext_lastchange * 1000 );
                    // https://maps.googleapis.com/maps/api/geocode/json?latlng=50.8924807,5.9712384
                    // results[0].formatted_address
                    request( geoRequest, function( _error, _response, _body )
                    {
                        if ( _error || _response.statusCode !== 200 )
                            return;

                        // Parse spaceAPI and set a last fetched timestamp
                        var geoData = JSON.parse( _body );
                        var data = ":" + ( _beacon.name ) + " is located near " + geoData.results[0].formatted_address + " at " + new Date( _beacon.ext_lastchange * 1000 );
                        global.responseQueue.push( { target : target, type : type, data : data } );
                    } );

                    //global.responseQueue.push( { target : target, type : type, data : data } );
                } //);
            } );
            return true;
        }
    },
    {
        name : "wiki",
        description : "displays last edit and newest wiki page info",
        type : "irc",
        method : function( _params )
        {
            var target, type;
            var response = {};

            if ( _params.target === global.connection.name )
                target = _params.source.split( "!" )[ 0 ];
            else
                target = _params.target;

            type = _params.type;

            try
            {
                xmlParser = require( "xml2js" );
            }
            catch( _ex )
            {
                console.log( _ex.Error );
                return { target : target, type : type, data : ":Wiki command not available due to missing component. Run `npm install xml2js` on the server and try again" };
            }

            //global.responseQueue.push( { target : target, type : type, data : ":No wiki data" } );

            fetchWikiData( function( _wiki )
            {
                
                var lastEdit = _wiki.lastEdit.entry[ 0 ];
                var newPages = _wiki.newPages.entry[ 0 ];
                var data;

                var simpleEditDate = getSimpleDate( lastEdit.updated[0] );
                var simpleNewDate = getSimpleDate( newPages.updated[0] );

                if ( lastEdit.title[0] === newPages.title[0] )
                {
                    data = ":Newest page & last edited: " + newPages.title[0];
                    if ( simpleEditDate === simpleNewDate )
                        data += " (created and edited " + simpleEditDate + " ago)";
                    else
                        data += " (created " + simpleNewDate + " and edited " + simpleEditDate + " ago)";
                }
                else
                {
                    data = ":Last edit: " + lastEdit.title[0] + " (" + simpleEditDate + " ago)";
                    data += ", Newest page: " + newPages.title[0] + " (" + simpleNewDate + " ago)";
                }

                global.responseQueue.push( { target : target, type : type, data : data } );
            } );

            //return { target : target, type : type, data : "Wiki command not yet available" };
            return true;
        }
    },
    {
        name : "github",
        description : "displays last github activity",
        type : "irc",
        method : function( _params )
        {
            var target, type;
            var response = {};

            if ( _params.target === global.connection.name )
                target = _params.source.split( "!" )[ 0 ];
            else
                target = _params.target;

            type = _params.type;


            fetchGithubData( function( _github )
            {
		//filter out WatchEvent from array

                var event = _github.filter( function( _entry )
		{
		    switch ( _entry.type )
		    {
			default:
			    return true;
		    }
		} )[ 0 ];

		var eventDescription = ":" + event.actor.login;
		// See: https://developer.github.com/v3/activity/events/types/
		switch ( event.type )
		{
		    case "CommitCommentEvent":
			eventDescription += " commented on ";
			eventDescription += event.repo.name + " (";
			eventDescription += getSimpleDate( event.created_at );
			eventDescription += " ago)";
			break;

		    case "CreateEvent":
			eventDescription += " created ";
			eventDescription += event.payload.ref ? event.payload.ref : "";
			eventDescription += event.payload.ref_type;
			eventDescription += event.payload.ref ? " on " : " ";
			eventDescription += event.repo.name + " (";
			eventDescription += getSimpleDate( event.created_at );
			eventDescription += " ago)";
			break;

                    /*
                    case "DeleteEvent":
                    case "DeploymentEvent":
                    case "DeploymentStatusEvent":
                    case "DownloadEvent":
                    case "FollowEvent":
                    case "ForkEvent":
                    case "ForkApplyEvent":
                    case "GistEvent":
                    case "GollumEvent":
                    case "IssueCommentEvent":
                    case "IssuesEvent":
                    case "MemberEvent":
                    case "MembershipEvent":
                    case "PageBuildEvent":
                    case "PublicEvent":
                    case "PullRequestEvent":
                    case "PullRequestReviewCommentEvent":
                    */
                    case "PushEvent":
                        eventDescription += " pushed ";
                        eventDescription += event.payload.size + " commit";
                        eventDescription += ( event.payload.size === 1 ) ? "" : "s";
                        eventDescription += " into ";
                        eventDescription += event.repo.name + " (";
                        eventDescription += getSimpleDate( event.created_at );
                        eventDescription += " ago)";
                        break;
                    /*
                    case "ReleaseEvent":
                    case "RepositoryEvent":
                    case "StatusEvent":
                    case "TeamAddEvent":
                    case "WatchEvent":
                    */

		    default:
			eventDescription += " applied unknown action (" + event.type + ") on ";
			eventDescription += event.repo.name + " (";
			eventDescription += getSimpleDate( event.created_at );
			eventDescription += " ago)";
			break;
		}
                global.responseQueue.push( { target : target, type : type, data : eventDescription } );
            } );

            return true;
        }
    },
    {
        name : "log",
        type : "http",
        method : function( _params )
        {
            // Copy over (part) of the log entries
            var logEntries = global.logEntries.slice( _params.max ? -Number(_params.max ) : 0 );

            if ( "after" in _params )
                logEntries = logEntries.filter( function( _entry )
                {
                    return _entry.timestamp > _params.after;
                } );

            return logEntries;
        }
    }
];

exports.ACKbotFeatures.handleRequest = function( _request, _params, _filter )
{
    var command = this.findCommand( _request, _filter );
    var result = null;

    if ( !command )
        return null;

    try
    {
        result = command( _params );
    }
    catch ( _ex )
    {
        console.log( "Command execution failed:", _ex );
    }

    return result;
};

