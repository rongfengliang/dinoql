const resolvers = require('./resolvers');
const _ = require('./utils');

function Transform(options) {
  let _objToGet = {};

  /**
   * @param {object} obj - An object
   * @param {object} obj.data - The object to query
   * @param {object} obj.nodeName - The name from node
   * @returns {Function} Returns the function to execute all resolvers from node.
   */
  const getResolved = ({ data, nodeName }) => args => {
    const arr = _.prop(nodeName, data);
    const result = args.reduce((acc, arg) => {
      const name = _.ast.getName(arg);
      const value = _.ast.getValue(arg);
      const resolver = _.propOr(resolvers.filterKey(name), name, resolvers);
      return resolver(arr, value);
    }, arr);

    return _.assoc(nodeName, result, data)
  };

  /**
   * The idea is iterate through list and when item is object, get each value and filter.
   * @param {object} obj - An object
   * @param {object} obj.data - The object to query
   * @param {object} obj.ast - Abstract Syntax Tree
   */
  const getItemsResolved = ({ data, ast }) => {
    const lastObjToGet = _objToGet;
    const result = data.reduce((acc, item) => {
      _objToGet = {};
      const value = getQueryResolved(ast, item)
      const nodeName = _.ast.getName(ast) || _.ast.getAlias(ast);
      const itemFiltered = _.dissoc(nodeName, item);
      return acc.concat({ ...itemFiltered, ...value });
    }, []);

    _objToGet = lastObjToGet;
    return result;
  };

  /**
   * The idea is iterate through `obj.selections` that are children from current node and filter.
   * @param {object} obj - An object
   * @param {object} obj.data - The object to query
   * @param {array} obj.props - The array of names from selections node
   * @param {object} obj.selections - The selections obj from node
   * @param {string} obj.nodeName - The name from node
   * @param {*} obj.nodeValue - The value from `obj.data` according to the `obj.nodeName`
   * @returns {Function} Returns `obj.data` filtered according to the `obj.selections`
   */
  const getChildreansResolved = ({ nodeValue, nodeName, selections, data, props }) => {
    const getFiltered = _.ifElse(
      Array.isArray,
      _.project(props),
      _.pick(props)
    );

    const filtered = getFiltered(nodeValue || []);
    const result = selections.reduce((acc, sel) => {
      const value = getQueryResolved(sel, filtered);

      if(options.keep) {
        return _.assoc(nodeName, value, acc)
      }

      const name = _.ast.getAlias(sel) || _.ast.getName(sel);
      if(Array.isArray(value)) {
        _objToGet[nodeName] = value
      } else if(!sel.selectionSet) {
        const valueFromNode = _.prop(name, value)
        if(valueFromNode) {
          _objToGet[name] = valueFromNode;
        }
      }

      return _objToGet;
    }, data);

    return result;
  };

  /**
   * @param {object} ast - Abstract Syntax Tree
   * @param {object} data - The data to query
   * @returns {Function} Returns `data` filtered according to the query using recursion.
   */
  function getQueryResolved(ast, data = {}) {
    const nodeAlias = _.ast.getAlias(ast);
    const oldNodeName = _.ast.getName(ast);
    const nodeName = nodeAlias || oldNodeName;
    const dataWithAlias = nodeAlias ? _.renameProp(oldNodeName, nodeAlias, data) : data;
    const selections = _.pathOr([], ['selectionSet', 'selections'], ast);
    const props = _.map(_.ast.getName, selections);
    const astArgs = _.propOr([], 'arguments', ast);
    const dataResolved = _.ifElse(
      _.isEmpty,
      _.always(dataWithAlias),
      getResolved({ data: dataWithAlias, nodeName })
    )(astArgs);

    const nodeValue = _.prop(nodeName, dataResolved);

    if(Array.isArray(dataResolved)) {
      return getItemsResolved({ nodeName, props, data: dataResolved, ast })
    }

    return getChildreansResolved({
      data: dataResolved,
      selections,
      nodeValue,
      nodeName,
      props,
    })
  }

  return {
    getQueryResolved
  };
}

module.exports = Transform;
