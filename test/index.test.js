'use strict';

const { assert } = require('chai');
const { Readable } = require('stream');

const { jStream } = require('../src/index');

const jStreamPromise = function readFromJStream(value, replacer) {
  const stream = jStream(value, replacer);
  return new Promise((resolve, reject) => {
    let result = '';
    stream.on('data', (data) => (result += data));
    stream.on('error', reject);
    stream.on('end', () => resolve(result));
  });
};

describe('j-streamify tests', () => {
  describe('Primitive types', () => {
    it("number 1 should yield '1'", () => {
      return jStreamPromise(1).then((result) => assert.equal(result, '1'));
    });

    it("boolean true should yield 'true'", () => {
      return jStreamPromise(true).then((result) => assert.equal(result, 'true'));
    });

    it('string "string" should yield \'"string"\'', () => {
      return jStreamPromise('string').then((result) => assert.equal(result, '"string"'));
    });

    it('undefined should not yield anything', () => {
      return jStreamPromise(undefined).then((result) => assert.equal(result, ''));
    });

    it("null should yield 'null'", () => {
      return jStreamPromise(null).then((result) => assert.equal(result, 'null'));
    });

    it("NaN should yield 'null'", () => {
      return jStreamPromise(NaN).then((result) => assert.equal(result, 'null'));
    });

    it('functions should yield empty string', () => {
      return jStreamPromise(function () {}).then((result) => assert.equal(result, ''));
    });
  });

  describe('Promises', () => {
    it('stringify value resolved by promise', () => {
      const value = 'a string to stringify';
      const promise = new Promise((resolve) => setTimeout(resolve, 10, value));
      return jStreamPromise(promise).then((result) => assert.equal(result, JSON.stringify(value)));
    });

    it('should emit error if promise fails', (done) => {
      const promise = new Promise((_, reject) => setTimeout(reject, 10, new Error('Promise failed')));
      jStreamPromise(promise)
        .then(() => done(new Error('Should not resolve')))
        .catch((err) => assert.equal(err.message, 'Promise failed'))
        .then(() => done())
        .catch(done);
    });
  });

  describe('Readable stream', () => {
    describe('Object Mode - false', () => {
      it('stringify a readable stream', () => {
        const stream = new Readable();
        const data = ['some data', 'to stringify', 'with funky characters\r', '\n \t" " " ` ` @ '];
        data.forEach((x) => stream.push(x));
        stream.push(null);

        return jStreamPromise(stream).then((result) => assert.equal(result, JSON.stringify(data.join(''))));
      });

      it('emits error if underlying readable stream does', (done) => {
        const stream = new Readable({
          read() {
            setImmediate(() => this.emit('error', new Error('src stream error')));
          },
        });

        jStreamPromise(stream)
          .then(() => done(new Error('Should fail when stream resource emits error')))
          .catch((err) => assert.equal(err.message, 'src stream error'))
          .then(() => done())
          .catch(done);
      });
    });

    describe('Object mode - true', () => {
      it('Readable streams in objectMode', async () => {
        const stream = new Readable({ objectMode: true });
        const data = [1, true, {}, '"string"', function () {}, undefined, NaN];
        data.forEach((x) => stream.push(x));
        stream.push(null);

        const result = await jStreamPromise(stream);
        assert.equal(result, JSON.stringify(data));
      });

      it('with replacer', () => {
        const objects = Array.from(new Array(5)).map(() => ({ a: 1, b: 2, c: 3 }));
        const expected = Array.from(new Array(5)).map(() => ({ a: 1, b: 2 }));
        const stream = new Readable({ objectMode: true });
        objects.forEach((x) => stream.push(x));
        stream.push(null);

        return jStreamPromise(stream, ['a', 'b']).then((result) => assert.equal(result, JSON.stringify(expected)));
      });

      it('emits error if underlying readable stream does', (done) => {
        const stream = new Readable({
          objectMode: true,
          read() {
            setImmediate(() => this.emit('error', new Error('src stream error')));
          },
        });

        jStreamPromise(stream)
          .then(() => done(new Error('Should fail when stream resource emits error')))
          .catch((err) => assert.equal(err.message, 'src stream error'))
          .then(() => done())
          .catch(done);
      });
    });
  });

  describe('Objects', () => {
    it('empty object should yield "{}"', () => {
      return jStreamPromise({}).then((result) => assert.equal(result, '{}'));
    });

    it('should stringify regular objects', async () => {
      const object = {
        number: 1,
        boolean: true,
        string: 'string',
        undefined: undefined,
        null: null,
      };
      const result = await jStreamPromise(object);
      assert.equal(result, JSON.stringify(object));
    });

    it('should ignore keys that contain functions', () => {
      const object = {
        a: 1,
        fn: () => {},
        b: 2,
      };

      return jStreamPromise(object).then((result) => assert.equal(result, JSON.stringify({ a: 1, b: 2 })));
    });

    it('should strinfify object containing streams and promises', () => {
      const stream = new Readable();
      const data = ['some data', 'to stringify', 'with funky characters\r', '\n \t" " " ` ` @ '];
      data.forEach((x) => stream.push(x));
      stream.push(null);

      const value = 'a string to stringify';
      const promise = new Promise((resolve) => setTimeout(resolve, 10, value));

      const object = {
        stream,
        promise,
      };

      const expectedObject = JSON.stringify({
        stream: data.join(''),
        promise: value,
      });

      return jStreamPromise(object).then((result) => assert.equal(result, expectedObject));
    });

    it('should use the object return by toJSON', () => {
      const obj = {
        somekey: 1,
        someOtherKey: 2,
        toJSON: () => ({
          a: 1,
          b: 2,
        }),
      };

      const expected = JSON.stringify({ a: 1, b: 2 });

      return jStreamPromise(obj).then((result) => assert.equal(result, expected));
    });
  });

  describe('Arrays', () => {
    it('empty array should yield "[]"', () => {
      return jStreamPromise([]).then((result) => assert.equal(result, '[]'));
    });

    it('should stringify regular arrays', () => {
      const array = [1, true, 'string', undefined, null, function () {}, NaN];
      return jStreamPromise(array).then((result) => assert.equal(result, JSON.stringify(array)));
    });

    it('should stringify arrays containing streams and promises', () => {
      const stream = new Readable();
      const data = ['some data', 'to stringify', 'with funky characters\r', '\n \t" " " ` ` @ '];
      data.forEach((x) => stream.push(x));
      stream.push(null);

      const value = 'a string to stringify';
      const promise = new Promise((resolve) => setTimeout(resolve, 10, value));

      const array = [stream, promise];
      const expected = JSON.stringify([data.join(''), value]);

      return jStreamPromise(array).then((result) => assert.equal(result, expected));
    });

    it('should use the toJSON of the elemts', () => {
      const array = [
        { index: 1, toJSON: () => ({ a: 1 }) },
        { index: 1, toJSON: () => ({ a: 2 }) },
      ];

      const expected = JSON.stringify([{ a: 1 }, { a: 2 }]);

      return jStreamPromise(array).then((result) => assert.equal(result, expected));
    });
  });

  describe('Stringify Object with a replacer', () => {
    describe('Array replacer', () => {
      it('partial match of keys and array', () => {
        const object = { a: 1, b: 2, c: 3 };
        return jStreamPromise(object, ['a']).then((result) => assert.equal(result, JSON.stringify({ a: 1 })));
      });

      it('multiple levels deep', () => {
        const object = {
          a: 1,
          b: {
            a: 'nested',
            c: 'should not be stringified',
          },
          c: 3,
        };

        const expected = JSON.stringify({
          a: 1,
          b: { a: 'nested' },
        });

        return jStreamPromise(object, ['a', 'b']).then((result) => assert.equal(result, expected));
      });

      it('No match of keys and arrays', async () => {
        const object = { a: 1, b: 2, c: 3 };
        const result = await jStreamPromise(object, ['d', 'e', 'f']);
        assert.equal(result, '{}');
      });
    });

    describe('Function replacer', () => {
      it('replacer should double values', () => {
        const replacer = function (key, value) {
          return key ? 2 * value : value;
        };

        const obj = {
          a: 1,
          b: 2,
        };

        const expected = JSON.stringify({
          a: 2,
          b: 4,
        });

        return jStreamPromise(obj, replacer).then((result) => assert.equal(result, expected));
      });
    });
  });

  describe('Stringify array with a replacer', () => {
    it('should have no effect using a array replacer', () => {
      const array = ['a', 'b', 'c', undefined];
      return jStreamPromise(array, ['d', 'e', 'f']).then((result) => assert.equal(result, JSON.stringify(array)));
    });

    it('should modify error with a function replacer', async () => {
      const array = [1, 2, 3];
      const result = await jStreamPromise(array, (key, value) => (key ? 2 * value : value));
      assert.equal(result, JSON.stringify([2, 4, 6]));
    });
  });
});
