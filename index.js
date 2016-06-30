'use strict';

var assert = require('chai').assert;
var E = require('linq');
var dropElement = require('./src/utils').dropElement;
var ArrayIterator = require('./src/iterators/array');
var SelectIterator = require('./src/iterators/select');
var MultiIterator = require('./src/iterators/multi');
require('sugar');
var BabyParse = require('babyparse');
var extend = require('extend');

var DataFrame = require('./src/dataframe');
var Series = require('./src/series');
var Index = require('./src/index');
var E = require('linq');

//
// Helper function to replicate a value.
//
var relicate = function (value, count) {
	var output = [];
	for (var i = 0; i < count; ++i) {
		output.push(value);
	}
	return output;
};

//
// Convert an object row to an array.
// todo: Feels like a bit of a hack to use this.
//
var toRow = function (row, columnNames) {
	return E.from(columnNames)
		.select(function (columnName) {
			return row[columnName];
		})
		.toArray();
};

//
// Records plugins that have been registered.
//
var registeredPlugins = {};

/**
 * Main namespace for Data-Forge.
 * 
 * Nodejs:
 * 
 * 		npm install --save data-forge
 * 		
 * 		var dataForge = require('data-forge');
 * 
 * Browser:
 * 
 * 		bower install --save data-forge
 * 
 * 		<script language="javascript" type="text/javascript" src="bower_components/data-forge/data-forge.js"></script>
 */
var dataForge = {
	
	DataFrame: DataFrame,
	Series: Series,
	Index: Index,

	/**
	 * Install a plugin in the dataForge namespace.
	 */
	use: function (plugin) {

		assert.isFunction(plugin, "Expected 'plugin' parameter to 'use' to be a function.");

		if (registeredPlugins[plugin] === plugin) {
			return; // Already registered.
		}

		registeredPlugins[plugin] = plugin;

		var self = this;
		plugin(self);
	},


	/**
	 * Deserialize a DataFrame from a JSON text string.
	 *
	 * @param {string} jsonTextString - The JSON text to deserialize.
	 * @param {config} [config] - Optional configuration option to pass to the DataFrame.
	 */
	fromJSON: function (jsonTextString, config) {
		
		assert.isString(jsonTextString, "Expected 'jsonTextString' parameter to 'dataForge.fromJSON' to be a string containing data encoded in the JSON format.");

		if (config) {
			assert.isObject(config, "Expected 'config' parameter to 'dataForge.fromJSON' to be an object with configuration to pass to the DataFrame.");
		}

		var baseConfig = {
			rows: JSON.parse(jsonTextString)
		};

		var dataFrameConfig = extend({}, config || {}, baseConfig);
		return new DataFrame(dataFrameConfig);
	},

	//
	// Deserialize a data from a CSV text string.
	//
	fromCSV: function (csvTextString, config) {
		assert.isString(csvTextString, "Expected 'csvTextString' parameter to 'dataForge.fromCSV' to be a string containing data encoded in the CSV format.");

		if (config) {
			assert.isObject(config, "Expected 'config' parameter to 'dataForge.fromJSON' to be an object with configuration to pass to the DataFrame.");
		}

		var csvConfig = extend({}, config);
		var parsed = BabyParse.parse(csvTextString, csvConfig);
		var rows = parsed.data;
		
		/* Old csv parsing.
		var lines = csvTextString.split('\n');
		var rows = E
			.from(lines) // Ignore blank lines.
			.where(function (line) {
				return line.trim().length > 0;
			})
			.select(function (line) {
				return E
					.from(line.split(','))
					.select(function (col) {
						return col.trim();
					})
					.select(function (col) {
						if (col.length === 0) {
							return undefined;
						}
						else {
							return col;
						}
					})
					.toArray();					
			})
			.toArray();
		*/

		if (rows.length === 0) {
			return new dataForge.DataFrame({ columnNames: [], rows: [] });
		}
				
		var columnNames = E.from(E.from(rows).first())
				.select(function (columnName) {
					return columnName.trim();
				})
				.toArray();

		var remaining = E.from(rows)
			.skip(1)
			.select(function (row) {
				return E.from(row)
					.select(function (cell) {
						return cell.trim();
					})
					.toArray()
			})
			.toArray();

		var baseConfig = {
			columnNames: columnNames, 
			rows: remaining,
		};
		var dataFrameConfig = extend({}, config || {}, baseConfig);
		return new dataForge.DataFrame(dataFrameConfig);
	},

	/**
	 * Merge data-frames by index or a particular column.
	 * 
	 * @param {DataFrame} leftDataFrame - One data frame to merge.
	 * @param {DataFrame} rightDataFrame - The other data frame to merge.
	 * @param {string} [columnName] - The name of the column to merge on. Optional, when not specified merge is based on the index.
	 */
	merge: function (leftDataFrame, rightDataFrame, columnName) {

		//todo: refactor and DRY the two code paths here.
		//todo: this probably just needs a rewrite so that multiple dataframes can be merged.

		assert.isObject(leftDataFrame, "Expected 'leftDataFrame' parameter to 'merge' to be an object.");
		assert.isObject(rightDataFrame, "Expected 'rightDataFrame' parameter to 'merge' to be an object.");

		if (columnName) {
			assert.isString(columnName, "Expected optional 'columnName' parameter to 'merge' to be a string.");

			var leftColumnIndex = leftDataFrame.getColumnIndex(columnName);
			if (leftColumnIndex < 0) {
				throw new Error("Column with name '" + columnName + "' doesn't exist in 'leftDataFrame'.");
			}

			var rightColumnIndex = rightDataFrame.getColumnIndex(columnName);
			if (rightColumnIndex < 0) {
				throw new Error("Column with name '" + columnName + "' doesn't exist in 'rightColumnIndex'.");
			}

			var leftPairs = leftDataFrame.toPairs();
			var rightPairs = rightDataFrame.toPairs();

			var mergedColumnNames = [columnName]
				.concat(dropElement(leftDataFrame.getColumnNames(), leftColumnIndex))
				.concat(dropElement(rightDataFrame.getColumnNames(), rightColumnIndex));

			var leftColumns = leftDataFrame.getColumnNames();
			var rightColumns = rightDataFrame.getColumnNames();

			var leftIndices = E.from(leftPairs)
				.select(function (leftPair) {
					return leftPair[1][leftColumns[leftColumnIndex]];
				})
				.toArray();
			var rightIndices = E.from(rightPairs)
				.select(function (rightPair) {
					return rightPair[1][rightColumns[rightColumnIndex]];
				})
				.toArray();

			var distinctIndices = E.from(leftIndices.concat(rightIndices)).distinct().toArray();

			var leftMap = E.from(leftPairs)
				.groupBy(function (leftPair) {
					return leftPair[1][leftColumns[leftColumnIndex]];
				})
				.toObject(
					function (group) {
						return group.key();
					},
					function (group) {
						return group.getSource();
					}
				);

			var rightMap = E.from(rightPairs)
				.groupBy(function (rightPair) {
					return rightPair[1][rightColumns[rightColumnIndex]];
				})
				.toObject(
					function (group) {
						return group.key();
					},
					function (group) {
						return group.getSource();
					}
				);

			var outputIndices = [];

			var mergedValues = E.from(distinctIndices) // Merge values, drop index.
				.selectMany(function (index) {
					var leftPairs = leftMap[index] || [];
					var rightPairs = rightMap[index] || [];
					var outputRows = [];

					if (leftPairs.length > 0) {
						leftPairs.forEach(function (leftPair) {
							assert.isArray(leftPair);

							if (rightPairs.length > 0) {
								
								rightPairs.forEach(function (rightPair) {
									assert.isArray(rightPair);

									var leftValues = dropElement(toRow(leftPair[1], leftColumns), leftColumnIndex);
									var rightValues = dropElement(toRow(rightPair[1], rightColumns), rightColumnIndex);
									var outputRow = [index]
										.concat(leftValues)
										.concat(rightValues)
										;

									outputIndices.push(leftPair[0]);
									outputRows.push(outputRow);
								});
							}
							else {
								var leftValues = dropElement(toRow(leftPair[1], leftColumns), leftColumnIndex);
								var rightValues = relicate(undefined, rightColumns.length-1);
								var outputRow = [index]
									.concat(leftValues)
									.concat(rightValues)
									;

								outputIndices.push(leftPair[0]);
								outputRows.push(outputRow);
							}
						});						
					}
					else {
						rightPairs.forEach(function (rightPair) {
							assert.isArray(rightPair);

							var leftValues = relicate(undefined, leftColumns.length-1);
							var rightValues = dropElement(toRow(rightPair[1], rightColumns), rightColumnIndex);
							var outputRow = [index]
								.concat(leftValues)
								.concat(rightValues)
								;
							
							outputIndices.push(rightPair[0]);
							outputRows.push(outputRow);
						});
					}

					return outputRows;
				})
				.toArray();

			return new DataFrame({
				columnNames: mergedColumnNames,
				rows: function () {
					return new ArrayIterator(mergedValues);
				},
				index: outputIndices,
			});			
		}
		else {
			var leftPairs = leftDataFrame.toPairs();
			var rightPairs = rightDataFrame.toPairs();

			var leftColumns = leftDataFrame.getColumnNames();
			var rightColumns = rightDataFrame.getColumnNames();
			var mergedColumnNames = leftColumns.concat(rightColumns);

			var leftIndices = leftDataFrame.getIndex().toValues();
			var rightIndices = rightDataFrame.getIndex().toValues();
			var distinctIndices = E.from(leftIndices.concat(rightIndices)).distinct().toArray();

			var leftMap = E.from(leftPairs)
				.groupBy(function (leftPair) {
					return leftPair[0];
				})
				.toObject(
					function (group) {
						return group.key();
					},
					function (group) {
						return group.getSource();
					}
				);

			var rightMap = E.from(rightPairs)
				.groupBy(function (rightPair) {
					return rightPair[0];
				})
				.toObject(
					function (group) {
						return group.key();
					},
					function (group) {
						return group.getSource();
					}
				);

			var outputIndices = [];

			var mergedValues = E.from(distinctIndices) 
				.selectMany(function (index) {
					var leftPairs = leftMap[index] || [];
					var rightPairs = rightMap[index] || [];
					var outputRows = [];

					if (leftPairs.length > 0) {
						leftPairs.forEach(function (leftPair) {
							assert.isArray(leftPair);

							if (rightPairs.length > 0) {
								
								rightPairs.forEach(function (rightPair) {
									assert.isArray(rightPair);

									outputIndices.push(index);

									var outputRow = [];

									leftColumns.forEach(function (leftColumnName) {
										outputRow.push(leftPair[1][leftColumnName]);
									});

									rightColumns.forEach(function (rightColumnName) {
										outputRow.push(rightPair[1][rightColumnName]);
									});

									outputRows.push(outputRow);
								});
							}
							else {
								outputIndices.push(index);

								var outputRow = [];

								leftColumns.forEach(function (leftColumnName) {
									outputRow.push(leftPair[1][leftColumnName]);
								});

								for (var i = 0; i < rightColumns.length; ++i) {
									outputRow.push(undefined);
								}

								outputRows.push(outputRow);
							}
						});
					}
					else {
						rightPairs.forEach(function (rightPair) {
							assert.isArray(rightPair);

							outputIndices.push(index);

							var outputRow = [];

							for (var i = 0; i < leftColumns.length; ++i) {
								outputRow.push(undefined);
							}

							rightColumns.forEach(function (rightColumnName) {
								outputRow.push(rightPair[1][rightColumnName]);
							});

							outputRows.push(outputRow);
						});
					}

					return outputRows;
				})
				.toArray();

			return new DataFrame({
				columnNames: mergedColumnNames,
				rows: function () {
					return new ArrayIterator(mergedValues);
				},
				index: outputIndices,
			});			
		}

	},

	/**
	 * Merge multiple series into a new DataFrame.
	 * 
	 * @param {array} columnNames - Array of strings that defines the column names for the resulting DataFrame. Must have the same number of elements as the 'series' parameter.
	 * @param {array} series - Array of series that defined the values for the columns. Must have the same number of elements as the 'columnNames' parameter.
	 */
	mergeSeries: function (columnNames, series) {
		assert.isArray(columnNames, "Expected 'columnNames' parameter of dataForge.mergeSeries to be an array of strings that specify column names in the resulting DataFrame.");
		assert.isArray(series, "Expected 'series' parameter of dataForge.mergeSeries to be an array of Series objects that specify the values for the columns in the resulting DataFrame.");

		columnNames.forEach(function (columnName) {
			//todo: specify bad index.
			assert.isString(columnName, "Expected 'columnNames' parameter of dataForge.mergeSeries to be an array of strings that specify column names in the resulting DataFrame.");
		});

		series.forEach(function (series) {
			//todo: specify bad index.
			assert.instanceOf(series, Series, "Expected 'series' parameter of dataForge.mergeSeries to be an array of Series objects that specify the values for the columns in the resulting DataFrame.");
		});

		assert(columnNames.length === series.length, "Expect 'columnNames' and 'series' parameters to dataForge.mergeSeries to be arrays with the same length. columnNames has length " + columnNames.length + ", series has length " + series.length);

		var distinctColumnNames = E.from(columnNames).distinct().toArray();
		assert(distinctColumnNames.length === columnNames.length, "Only distinct column names are allowed, please remove duplicates from: " + columnNames.join(', ') + ".");

		return E.from(columnNames)
			.zip(series, function (columnName, series) {
				return series.inflate(function (value) {
					var output = {};
					output[columnName] = value;
					return output;
				});
			})
			.aggregate(function (mergedDataFrame, toMerge) { //todo: just call the function that will merge multiple DFs
				return mergedDataFrame.merge(toMerge);
			});
	},

	/**
	 * Concatenate multiple data frames into a single.
	 *
	 * @param {array} dataFrames - Array of data frames to concatenate.
	 */
	concat: require('./src/concat-dataframes'),

	/**
	 * Generate a series from a range of numbers.
	 *
	 * @param {int} start - The value of the first number in the range.
	 * @param {int} count - The number of sequential values in the range.
	 */
	range: function (start, count) {

		assert.isNumber(start, "Expect 'start' parameter to range function to be a number.");
		assert.isNumber(count, "Expect 'count' parameter to range function to be a number.");

		return new Series({
				values: function ()  {

					var i = -1;

					return { //todo: should have a range iterator.
						moveNext: function () {
							return ++i < count;
						},

						getCurrent: function () {
							return start + i;
						},

					};
				},
			});
	},

	/**
	 * Generate a data-frame containing a matrix of values.
	 *
	 * @param {int} numColumns - The number of columns in the data-frame.
	 * @param {int} numRows - The number of rows in the data-frame.
	 * @param {number} start - The starting value.
	 * @param {number} increment - The value to increment by for each new value.
	 */
	matrix: function (numColumns, numRows, start, increment) {
		return new DataFrame({
			columnNames: E.range(1, numColumns)
				.select(function (columnNumber) {
					return columnNumber.toString();
				})
				.toArray(),

			rows: function () {
				var rowIndex = 0;
				var nextValue = start;
				var curRow = undefined;

				return {
					moveNext: function () {
						if (rowIndex >= numRows) {
							return false;
						}
						curRow = E.range(0, numColumns)
							.select(function (columnIndex) {
								return nextValue + (columnIndex * increment);
							})
							.toArray();
						nextValue += numColumns * increment;
						++rowIndex;
						return true;
					},

					getCurrent: function () {
						return curRow;
					}
				};
			},
		})
	},

	/*
	 * Zip together multiple series to create a new series.
	 *
	 * @param {array} series - Array of series to zip together.
	 * @param {function} selector - Selector function that produces a new series based on the input series.
	 */
	zipSeries: require('./src/zip-series.js'),

	/*
	 * Zip together multiple data-frames to create a new data-frame.
	 *
	 * @param {array} dataFrames - Array of data-frames to zip together.
	 * @param {function} selector - Selector function that produces a new data-frame based on the input data-frames.
	 */
	zipDataFrames: function (dataFrames, selector) {

		assert.isArray(dataFrames, "Expected 'dataFrames' parameter to zipDataFrames to be an array of Series objects.");
		assert.isFunction(selector, "Expected 'selector' parameter to zipDataFrames to be a function.");

		//todo: make this lazy.

		var dataFrameContents = E.from(dataFrames)
			.select(function (dataFrame) {
				return dataFrame.toObjects();
			})
			.toArray();

		var length = E.from(dataFrameContents).select(function (objects) { 
				return objects.length; 
			})
			.min();

		var output = [];

		for (var i = 0; i < length; ++i) {
			var curElements = E.from(dataFrameContents)
				.select(function (objects) {
					return objects[i];
				})
				.toArray();
			output.push(selector(curElements));
		}

		return new DataFrame({
			index: dataFrames[0].getIndex(),
			rows: output,
		});
	},	
};

module.exports = dataForge;