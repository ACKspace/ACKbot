/*
TODO:
(M) split off starting colon on message data

(s) split messages into \r\n (might fail otherwise; see MOTD)

(C) check for quit/part messages on self
(C) cache index.html
(C) work with away messages (connected listeners)
(C) allow relay chat on #ACKspaceBots or #ACKspaceRelay
*/
"use strict";

global.connection = {
    name     : "ACKbot",
    server   : "irc.libera.chat",
    port     : 6667,
    channels : "#ACKspace,#ACKspaceBots"
};
var maxLogEntries = 100;
global.logEntries = [];
global.responseQueue = [];

var strACKbotFeatures = "./ACKbotFeatures.js";
var net         = require( "net"  );
var http        = require( "http" );
var fs          = require( "fs"   );
var features    = require( strACKbotFeatures );

// Watch ACKbot features file (so we can do real-time updating
fs.watchFile( strACKbotFeatures, function()
{
    console.log( "* Features file changed, reloading" );
    delete require.cache[ require.resolve( strACKbotFeatures ) ];

    try
    {
        features = require( strACKbotFeatures );
    }
    catch ( _ex )
    {
        console.error( "! failed to reload features file", _ex );
    }
} );

var client;
try
{
    client = new net.Socket( );

    //client = net.createConnection( { host: server, port: 6667}, connectListener );
    client.connect( { host: global.connection.server, port: 6667}, connectListener );
}
catch ( _err )
{
    console.log( "Failed to connect:", _err );
}

function connectListener()
{
    console.log( "* Connected to IRC" );

    // NICK [IDENT@ip]
    // ircname=REALNAME
    //self.conn.send(bytes("USER %s %s bla :%s\r\n" % (ident, host, realname),'utf-8'))
    client.write( "NICK " + global.connection.name + "\n" );
    client.write( "USER " + global.connection.name + " " + global.connection.server + " ACK :Information and (eReader) log provider bot\n" );
    client.write( "JOIN :" + global.connection.channels + "\n" );
};

var fields = [ "source", "command", "target", "data" ];

client.setTimeout( 180000 );

client.on('data', function( _data )
{
    var message = String( _data ).split( " " );
    var messageLog = {};
    var response = null;
    var command;

    if ( message[ 0 ] === "PING" )
    {
        console.log( "Server heartbeat" );
        client.write( "PONG " + message.data + "\n" );

        // Don't store the message and early out
        return;
    }

    switch ( message[ 1 ] )
    {
        case "353": //:rajaniemi.freenode.net 353 ACKbot_js @ #ACKspaceBots :ACKbot_js xopr
            break;

        case "366": //:rajaniemi.freenode.net 366 ACKbot_js #ACKspaceBots :End of /NAMES list.
        case "372": //:rajaniemi.freenode.net 372 ACKbot_js :-
        case "376": //:rajaniemi.freenode.net 376 ACKbot_js :End of /MOTD command.
        case "402": //:rajaniemi.freenode.net 402 ACKbot_js 130.255.72.221 :No such server
        case "451": //:rajaniemi.freenode.net 451 * :You have not registered
            console.log( "*", message[ 1 ] );
            break;

        case "433": //:rajaniemi.freenode.net 433 * ACKbot :Nickname is already in use.
            console.log( "* Nickname already in use" );
            break;

        case "JOIN":
            //
            messageLog.source = message.shift().substr( 1 );
            messageLog.type = message.shift();
            messageLog.target = message.shift();
            messageLog.timestamp = Date.now();

            // TODO: strip off \r\n
            if ( messageLog.source.split( "!" )[ 0 ] === global.connection.name )
                console.log( "*", "Joined", messageLog.target );
            break;
        //:ACKbot_js!~ACKbotjs@84-245-26-101.dsl.cambrium.nl JOIN #ACKspaceBots
        /*
        case "PART":
        case "QUIT":
        case "MODE":
            break;
        */
        case "NOTICE":
            break;

        case "PRIVMSG":
            messageLog.source = message.shift().substr( 1 );
            messageLog.type = message.shift();
            messageLog.target = message.shift();
            messageLog.data = message.join( " " );//.substr( 1 );
            messageLog.timestamp = Date.now();

            // Look for bot execute token (!)
            if ( command = messageLog.data.match( "^:(![^ ]+)" ) )
                response = features.ACKbotFeatures.handleRequest( command[ 1 ], messageLog, "irc" );
            break;

        default:
            console.log( String( _data ) );
            break;
    }

    // Public message?
    if ( messageLog.target && messageLog.target !== global.connection.name )
    {
        global.logEntries.push( messageLog );
    }

    handleResponse( response );
});

/*
client.on( 'error', function()
{
    //ECONNRESET
	console.log('Connection error',arguments);
} );
*/

client.on( 'timeout', function()
{
    // First, a timeout occurs
    // TODO: might want to call socket.destroy(), which is not nice but might fix the problem:
    // https://github.com/websockets/ws/issues/180#issuecomment-17678872
    console.log('Connection timeout');
    try
    {
	client.destroy();
        //client.end();
    }
    catch ( _err )
    {
        console.log( "Failed to end connection:", _err );
    }
} );

client.on( 'end', function()
{
	// Next, the connection ends
	console.log('Connection ended');
} );

client.on( 'close', function()
{
    // Finally, the connection closes and we might want to reconnect.
    console.log('Connection closed, reconnecting' );
    try
    {
        client.connect( { host: global.connection.server, port: 6667}, connectListener );
    }
    catch ( _err )
    {
        console.log( "Failed to reconnect:", _err );
    }
} );


function handleResponse( _responseData, _timeout )
{
    var response = null;

    if ( _responseData && typeof _responseData !== "boolean" )
    {
        client.write( _responseData.type + " " + _responseData.target + " " + _responseData.data + "\n" );

        // Log if public channel message
        if ( _responseData.target[0] === "#" )
        {
            _responseData.source = global.connection.name;
            _responseData.timestamp = Date.now();

            global.logEntries.push( _responseData );
        }
    }

    // Handle queue if we have something in it
    if ( global.responseQueue.length )
        response = global.responseQueue.shift();

    // For async messages, create a timeout
    if  ( _responseData === true )
        _timeout = 10;

    if ( response || _timeout )
        setTimeout( handleResponse.bind( this, response, _timeout ? _timeout - 1 : null ), 1000 );

    // Rotate logs
    global.logEntries = global.logEntries.slice( -maxLogEntries );
}

function parseMessageData( _data )
{
    // TODO: split into newlines as well
    var message = String( _data ).split( " " );

    // Add empty source if no source was given
    if ( message[ 0 ][ 0 ] !== ":" )
        message.splice( 0, 0, null );

    // NOTE: If command is a number, there may be more data fields
    var objMessage = {};
    message.forEach( function( _messagePart, _index )
    {
        // repeat "data", "data2".. if we have more than the basic 4 field types
        var field = ( _index > 3 ) ? fields[ 3 ] + (_index - 2) : fields[ _index ];
        objMessage[ field ] = _messagePart;
    } );

    return objMessage;
}

// Configure our HTTP server to respond with Hello World to all requests.
var server = http.createServer( function( _request, _response )
{
    // Test for query command
    var queryPos = _request.url.indexOf( "?" );

    // return url (without query and leading slash)
    var url = ( queryPos !== -1 ) ? _request.url.substring( 1, queryPos ) : _request.url.substr( 1 );
    var query = {};

    // create query params if we have them
    if ( queryPos !== -1 )
    {
        _request.url.substr( queryPos + 1 ).split( "&" ).forEach( function( _kvp )
        {
            var assignPos = _kvp.indexOf( "=" );
            if ( assignPos === -1 )
                query[ _kvp ] = true;
            else
                query[ _kvp.substr( 0, assignPos ) ] = _kvp.substr( assignPos + 1 );
        } );
    }

    switch ( url.toLowerCase() )
    {
        case "":
        case "index.html":
            _response.writeHead( 200, { "Content-Type": "text/html" } );

            // TODO: cache the file and watch it
            _response.write( fs.readFileSync( "index.html" ) );
            break;

        case "log":
            // NOTE: this request is synchronous
            _response.writeHead( 200, { "Content-Type": "application/json" } );
            _response.write( JSON.stringify( features.ACKbotFeatures.handleRequest( url, query, "http" ) ) );
            break;

        default:
            _response.writeHead( 404, { "Content-Type": "text/plain" } );
            _response.write( "404: nope" );
    }

    _response.end( );
} );

// Listen on port 8000, IP defaults to 127.0.0.1
server.listen( 8000/*, "127.0.0.1"*/ );

console.log( "* initialized" );

