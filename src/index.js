const net = require('net');
const PacketStream = require('./packet_stream');
const AMQPFrameStream = require('./amqp_frame_stream');

const client = new net.Socket();
client.connect(5672, '127.0.0.1', function () {
    console.log('Connected');
    client.write(Buffer.from([
        'A'.charCodeAt(0),
        'M'.charCodeAt(0),
        'Q'.charCodeAt(0),
        'P'.charCodeAt(0),
        0, 0, 9, 1
    ]));
});

const packetStream = new PacketStream({ schema: [
    {name: 'type', size: 1, type: 'UIntBE', enum: { 1: 'METHOD', 2: 'HEADER', 3: 'BODY', 4: 'HEARTBEAT', }},
    {name: 'channel', size: 2, type: 'UIntBE'},
    {name: 'size', size: 4, type: 'UIntBE'},
    {name: 'payload', stream: true, sizeFrom: 'size'},
    {name: 'frame-end', size: 1},
]});
client.pipe(packetStream);

const amqpFrameStream = new AMQPFrameStream();
packetStream.pipe(amqpFrameStream);

amqpFrameStream.on('data', function (data) {
    console.log(data);
});

packetStream.on('end', function () {
    console.log('Connection closed');
})