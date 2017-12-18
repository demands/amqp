const PacketStream = require('.');
const {expect} = require('chai');

describe('PacketStream', function () {
    it('can read packet streams with defined schemas', function (done) {
        const packetStream = new PacketStream({ schema: [
            {name: 'type', size: 4, type: 'UIntBE'},
            {name: 'payload', stream: true, size: 10},
        ]});

        packetStream.write(Buffer.concat([
            Buffer.from([0,0,0,40]), // type
            Buffer.from('ten chars!'), // payload
        ]));
        packetStream.end();

        const parts = [];
        packetStream.on('data', (part) => parts.push(part));
        packetStream.on('end', function () {
            expect(parts).to.have.length(2);

            expect(parts[0]).to.have.property('name', 'type');
            expect(parts[0]).to.have.property('value', 40);

            expect(parts[1]).to.have.property('name', 'payload');
            expect(parts[1]).to.have.property('streaming', true);
            expect(parts[1]).to.have.property('size', 10);
            expect(parts[1].chunk.toString('utf8')).to.equal('ten chars!');

            done();
        });
    });

    it('can read packet streams split into more than one chunk', function (done) {
        const packetStream = new PacketStream({ schema: [
            {name: 'type', size: 4, type: 'UIntBE'},
            {name: 'payload', stream: true, size: 10},
            {name: 'finish', size: 1},
        ]});

        packetStream.write(Buffer.from([0]));
        packetStream.write(Buffer.from([0]));
        packetStream.write(Buffer.concat([
            Buffer.from([0,40]),
            Buffer.from('ten '),
        ]));
        packetStream.write(Buffer.from('ch'));
        packetStream.write(Buffer.concat([
            Buffer.from('ars!'),
            Buffer.from([0xCE]),
        ]));
        packetStream.end();

        const parts = [];
        packetStream.on('data', (data) => parts.push(data));
        packetStream.on('end', function () {
            expect(parts).to.have.length(5);

            expect(parts[0]).to.have.property('name', 'type');
            expect(parts[0]).to.have.property('value', 40);

            expect(parts[1]).to.have.property('name', 'payload');
            expect(parts[1]).to.have.property('streaming', true);
            expect(parts[1]).to.have.property('size', 10);
            expect(parts[1].chunk.toString('utf8')).to.equal('ten ');

            expect(parts[2]).to.have.property('name', 'payload');
            expect(parts[2]).to.have.property('streaming', true);
            expect(parts[2]).to.have.property('size', 10);
            expect(parts[2].chunk.toString('utf8')).to.equal('ch');

            expect(parts[3]).to.have.property('name', 'payload');
            expect(parts[3]).to.have.property('streaming', true);
            expect(parts[3]).to.have.property('size', 10);
            expect(parts[3].chunk.toString('utf8')).to.equal('ars!');

            expect(parts[4]).to.have.property('name', 'finish');
            expect(parts[4].value[0]).to.equal(0xCE);

            done();
        });
    });

    it('can read variable-length data streams', function (done) {
        const packetStream = new PacketStream({ schema: [
            {name: 'size', size: 1, type: 'UIntBE'},
            {name: 'payload', stream: true, sizeFrom: 'size'},
        ]});

        const testString = 'I wonder how long this string might be.';
        packetStream.write(Buffer.concat([
            Buffer.from([testString.length]), // size
            Buffer.from(testString),
        ]));
        packetStream.end();

        const parts = [];
        packetStream.on('data', (data) => parts.push(data));
        packetStream.on('end', function () {
            expect(parts).to.have.length(2);

            expect(parts[0]).to.have.property('value', testString.length);

            expect(parts[1]).to.have.property('name', 'payload');
            expect(parts[1]).to.have.property('streaming', true);
            expect(parts[1]).to.have.property('size', testString.length);
            expect(parts[1].chunk.toString('utf8')).to.equal(testString);

            done();
        });
    });

    it('can parse enums', function (done) {
        const packetStream = new PacketStream({ schema: [
            {name: 'type', size: 1, type: 'UIntBE', enum: {
                1: 'ONE',
                2: 'TWO',
                3: 'THREE',
            }},
        ]});

        packetStream.write(Buffer.from([2]));
        packetStream.end();

        const parts = [];
        packetStream.on('data', (data) => parts.push(data));
        packetStream.on('end', function () {
            expect(parts).to.have.length(1);
            expect(parts[0]).to.have.property('name', 'type');
            expect(parts[0]).to.have.property('value', 'TWO');
            done();
        });
    });

    it('properly handles packet streams that end early', function (done) {
        const packetStream = new PacketStream({ schema: [
            {name: 'payload', stream: true, size: 100},
        ]});

        const string = 'Short-ish string';

        const parts = [], errors = [];
        packetStream.on('data', (data) => parts.push(data));
        packetStream.on('error', (error) => errors.push(error));
        packetStream.on('end', function () {
            expect(parts).to.have.length(1);
            expect(parts[0].chunk.toString('utf-8')).to.equal(string);
            expect(errors).to.have.length(1);
            expect(errors[0]).to.have.property('message', 'Stream ended before recieving a complete packet');
            done();
        })

        packetStream.write(Buffer.from(string));
        packetStream.end();
    });

    it('reads more than one packet', function (done) {
        const packetStream = new PacketStream({ schema: [
            {name: 'number', size: 2, type: 'UIntBE'},
        ]});

        packetStream.write(Buffer.from([0, 10, 1, 0]))
        packetStream.write(Buffer.from([0, 20, 1, 25]))
        packetStream.end();

        const parts = [];
        packetStream.on('data', (data) => parts.push(data));
        packetStream.on('end', function () {
            expect(parts).to.have.length(4);

            expect(parts[0]).to.have.property('name', 'number');
            expect(parts[0]).to.have.property('value', 10);
            expect(parts[0]).to.have.property('packetIndex', 0);

            expect(parts[1]).to.have.property('name', 'number');
            expect(parts[1]).to.have.property('value', 256);
            expect(parts[1]).to.have.property('packetIndex', 1);

            expect(parts[2]).to.have.property('name', 'number');
            expect(parts[2]).to.have.property('value', 20);
            expect(parts[2]).to.have.property('packetIndex', 2);

            expect(parts[3]).to.have.property('name', 'number');
            expect(parts[3]).to.have.property('value', 281);
            expect(parts[3]).to.have.property('packetIndex', 3);

            done();
        })
    });
});