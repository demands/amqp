const {Transform} = require('stream');

module.exports = class PacketStream extends Transform {
    constructor(options) {
        super({
            readableObjectMode: true,
            writableObjectMode: false,
        });

        this._partSchemas = options.schema;

        /* state */
        this._resetPart();
        this._resetPacket();
        this._packetIndex = 0;
    }

    _resetPart() {
        this._partOctetsParsed = 0;
        this._partParsedSoFar = Buffer.from([]);
    }

    _resetPacket() {
        this._packet = {};
        this._currentPart = 0;
    }

    _getPartSchema() {
        return this._partSchemas[this._currentPart];
    }

    _getPartSize() {
        const schema = this._getPartSchema();
        const size = schema.size != null ? schema.size : this._packet[schema.sizeFrom];

        if (!Number.isInteger(size)) {
            throw new Error(`Could not determine appropriate size for "${schema.name}" packet part`);
        }

        return size;
    }

    _getRemainingPartSize() {
        return this._getPartSize() - this._partOctetsParsed;
    }

    _parsePartChunk(partChunk) {
        this._partOctetsParsed += partChunk.length;
        const schema = this._getPartSchema();
        const size = this._getPartSize();

        if (schema.stream === true) {
            this._pushPart({
                streaming: true,
                size: this._getPartSize(),
                chunk: partChunk,
            })
        } else {
            this._partParsedSoFar = Buffer.concat([this._partParsedSoFar, partChunk]);
        }

        if (this._partOctetsParsed === size) {
            this._finishPart();
        }
    }

    _finishPart() {
        const schema = this._getPartSchema();

        if (schema.stream !== true) {
            let value = this._partParsedSoFar;
            if (schema.type === 'UIntBE') {
                if (value.length > 6) {
                    throw new Error(`Can't read an unsigned int from ${value.length} bytes for "${schema.name}" packet part`);
                }
                value = value.readUIntBE(0, value.length, true);
            }

            if (schema.enum != null) {
                if (schema.enum[value] == null) {
                    throw new Error(`"${schema.name}" packet part had invalid data ${value}`);
                }
                value = schema.enum[value];
            }

            this._packet[schema.name] = value;
            this._pushPart({value});
        }

        this._currentPart++;
        this._resetPart();

        if (this._currentPart === this._partSchemas.length) {
            this._resetPacket();
            this._packetIndex++;
        }
    }

    _pushPart(data) {
        this.push(Object.assign({ 
            name: this._getPartSchema().name,
            packetIndex: this._packetIndex,
        }, data));
    }

    _transform(packetChunk, encoding, callback) {
        try {
            let packetChunkOctet = 0;
            while (packetChunkOctet < packetChunk.length) {
                let partChunk = packetChunk.slice(packetChunkOctet, Math.min(packetChunk.length, packetChunkOctet + this._getRemainingPartSize()));
                this._parsePartChunk(partChunk);
                packetChunkOctet += partChunk.length;
            }
            callback();
        } catch (e) {
            callback(e);
        }

    }

    _flush(callback) {
        if (this._partOctetsParsed !== 0 || this._currentPart !== 0) {
            callback(new Error('Stream ended before recieving a complete packet'))
        }
        callback();
    }
}
