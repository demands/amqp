const sax = require('sax');
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'spec', 'amqp0-9-1.stripped.xml');
const fstream = fs.createReadStream(file);
const parser = sax.createStream(true, {
    trim: true,
    normalize: true,
    lowercase: true,
});

const root = {
    children: [],
};
const stack = [root];

parser.on('opentag', ({name, attributes}) => {
    const pointer = stack[stack.length - 1];
    const tag = {name, attributes, children: []};
    pointer.children.push(tag);
    stack.push(tag);  
});

parser.on('closetag', (tag) => {
    stack.pop();
});

parser.on('end', () => {
    const amqp = root.children[0];
    const constants = filterChildrenByNameAndMap(amqp, 'constant', getAttributesAndAsserts);
    const domains = filterChildrenByNameAndMap(amqp, 'domain', getAttributesAndAsserts);
    const classes = filterChildrenByNameAndMap(amqp, 'class', t => Object.assign(
        {},
        getAttributes(t),
        {
            chassis: getChassis(t),
            fields: getFields(t),
            method: filterChildrenByNameAndMap(t, 'method', m => Object.assign(
                {},
                getAttributes(m),
                {
                    chassis: getChassis(m),
                    response: filterChildrenByNameAndMap(m, 'response', getAttributesAndAsserts)[0],
                    fields: getFields(m),
                },
            ))
        }
    ));

    const values = {constants, domains, classes};
    console.log(JSON.stringify(values, null, 3))
});

function getAttributes (tag) {
    return tag.attributes;
}

function getAttributesAndAsserts (tag) {
    return Object.assign(
        {},
        getAttributes(tag),
        {
            validation: tag.children
                .filter(c => c.name === 'assert')
                .map(a => a.attributes),
        }
    );
}

function filterChildrenByNameAndMap (tag, name, mapper) {
    return tag.children.filter(t => t.name === name).map(mapper);
}

function getChassis (tag) {
    return filterChildrenByNameAndMap(tag, 'chassis', getAttributesAndAsserts);
}

function getFields (tag) {
    return filterChildrenByNameAndMap(tag, 'field', getAttributesAndAsserts);
}

fstream.pipe(parser);
