'use strict';

describe('Index', function () {

	var LazyIndex = require('../src/lazyindex');
	var ArrayEnumerator = require('../src/iterators/array');

	var expect = require('chai').expect;

	it('can get values from index', function () {

		var index = new LazyIndex(
			"__test__",
			function () { 
				return new ArrayEnumerator([0, 1, 2, 3]); 
			}
		);
		expect(index.toValues()).to.eql([0, 1, 2, 3]);
	});

});