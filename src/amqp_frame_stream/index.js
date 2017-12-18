const {Transform} = require('stream');
const PacketStream = require('../packet_stream');

module.exports = class AMQPFrameStream extends Transform {
    constructor(options) {
        super({
            readableObjectMode: true,
            writableObjectMode: true,
        });
        
        /* state */
    }

    _transform(part, encoding, callback) {
        if (part.name === 'type') {
            this._type = part.value;
        } else if (part.name === 'payload') {
            if (this._type === 'METHOD') {
                if (this._payloadStream == null) {
                    this._payloadStream = new PacketStream({ schema: [
                        {name: 'class-id', size: 2, type: 'UIntBE'},
                        {name: 'method-id', size: 2, type: 'UIntBE'},
                        {name: 'arguments', size: part.size - 4},
                    ]});
                    this._payloadStream.on('data', (innerPart) => this.push(innerPart));
                }
                this._payloadStream.write(part.chunk);
            }
        } else if (part.name === 'frame-end') {
            delete this._payloadStream;
        }
        callback();
    }
}

const testInput = Buffer.concat([
    Buffer.from([1]), // type: METHOD
    Buffer.from([0,12]), // channel: 12
    Buffer.from([0,0,0,10]), // size
    Buffer.from('ten chars!'), // payload
    Buffer.from([0xCE]), // frame end
]);
