// Loads the area specific navigation object into
// App.navigation
import log from 'log';
import Ember from 'ember';
import NavigationItemsProvider from './provider';

export default {
  name: 'navigation-items-provider',
  needs: ['resources', 'pages', 'init'],

  initialize: function(container, application, input, output) {
    var api = input.init.api,
      config = input.init.config['navigation-items-provider'],
      l10n = input.init.l10n,
      authN = input.init.authN,
      apiDoc = input.init.apiDoc;

    var rawNavItems = {};

    // TODO: match iri path with invend.res for type http://meta.invend.eu/navigation#Item
    if (!config.resources) {
      log.info('Navigation resources not set in config');
      return;
    }

    var qp = {
      filters: 'area:' + apiDoc.currentArea
    };

    var getRdfsMember = function(data) {
      var context = data['@context'];
      for (var key in context) {
        if (typeof context[key] === 'object') {
          if (context[key]['@id'] === 'hydra:member') {
            return key;
          }
        } else if (typeof context[key] === 'string') {
          if (context[key] === 'hydra:member') {
            return key;
          }
        }
      }
    };

    /*
     * Unpack the data retrieved by the server.
     * If the data seems to be a Collection, search for the
     * RDF Member key within context and return the value associated to the key.
     * This function will be replaced by the ajax module in the future.
     */
    var unpack = function(data) {
      if (data['@type'] === 'PagedCollection') {
        return data[getRdfsMember(data)];
      }
      return data;
    };

    var findClass = function(className, data) {
      var context = data['@context'];
      for (var key in context) {
        var property = context[key];
        if (property === className) {
          return key;
        } else if (property instanceof Object) {
          if ('@id' in property) {
            if (property['@id'] === className) {
              return key;
            }
          }
        }
      }
    };

    var findLabel = function(data) {
      return findClass('rdfs:label', data);
    };

    var findBroader = function(data) {
      return findClass('skos:broaderTransitive', data);
    };

    var orig_localize = config.localize || function(l) {
      return l;
    };

    var localize = (function (locale) {
      return function (l) {
        return orig_localize(l, locale);
      };
    })(l10n.get('locale'));

    var processActive = function(item) {
      var makeScope = function(invend) {
        return function(item) {
          item.evalActive = item.active;
          item.active = eval(item.active);
        };
      };
      if (typeof item.active === 'string') {
        makeScope({
          authN: authN
        })(item);
      }
      return item;
    };

    var resolveItems = function(items) {
      var promises = [];
      items.forEach(function(item) {
        item = processActive(item);
        if ('items' in item) {
          // If items array is the size of 1 and the only item is a string it must be an IRI
          if (item.items.length === 1 && typeof item.items[0] === 'string') {
            var resIRI = item.items[0];
            var promise = api.get(resIRI).then(function(data) {
              rawNavItems = Ember.copy(data, true);
              var labelKey = findLabel(data);
              var broaderKey = findBroader(data);
              data = unpack(data);
              if ('items' in data) {
                return resolveItems(items);
              } else {
                if (data instanceof Array) {
                  var toRemove = [];
                  var dMap = {};
                  data.forEach(function(dItem) {
                    dMap[dItem['@id']] = dItem;
                  });
                  data.forEach(function(dItem) {
                    var label = dItem[labelKey];
                    label = localize(label);
                    dItem.title = label;
                    dItem.label = label;
                    if (item.page && !dItem.page) {
                      dItem.page = item.page;
                    }

                    if (broaderKey in dItem) {
                      var broaderIri = dItem[broaderKey];
                      var broaderItem = dMap[broaderIri];
                      if (broaderItem) {
                        if (broaderItem.items instanceof Array) {
                          broaderItem.items.push(dItem);
                        } else {
                          broaderItem.items = [dItem];
                        }
                        toRemove.push(dItem);
                      }

                    }
                  });
                  toRemove.forEach(function(remove) {
                    var i = data.indexOf(remove);
                    data.splice(i, 1);
                  });
                  item.items = data;
                } else {
                  var label = data[labelKey];
                  data.title = label;
                  data.label = label;
                  item.items = [data];
                }
              }
            });
            promises.push(promise);
          }
        }
      });
      return Ember.RSVP.all(promises);
    };

    var appendParent = function(items) {
      items.forEach(function(item) {
        if (item.items instanceof Array) {
          item.items.forEach(function(subItem) {
            subItem._parentItem = item;
          });
          appendParent(item.items);
        }
      });
    };

    var sortItems = function(items) {
      var key = 'displayOrder';
      items.sort(function(a, b) {
        if (key in a && key in b) {
          return a[key] - b[key];
        }
      });
      items.forEach(function(item) {
        if ('items' in item) {
          sortItems(item.items);
        }
      });
    };

    return api.getBatch(config.resources, {
      queryParams: qp
    }).then(function(resources) {
      var navigations = [];
      resources.forEach(function(res) {
        navigations = navigations.concat(unpack(res.result));
      });

      var promises = [];
      navigations.forEach(function(navigation) {
        if (navigation.items) {
          promises.push(resolveItems(navigation.items));
        }
      });
      return Ember.RSVP.all(promises).then(function() {
        navigations.forEach(function(navigation) {
          if (navigation.items) {
            sortItems(navigation.items);
            appendParent(navigation.items);
          }
        });
        var baseURL = apiDoc.mainURL;
        application.navigationItemsProvider = NavigationItemsProvider.create({
          container: container,
          navigations: navigations,
          pages: input.pages.pages,
          baseURL: baseURL,
          useSlug: config.useSlug,
          rawNavItems: rawNavItems,
          localize: localize,
          processActive: processActive,
          l10n: l10n,
          authN: authN,
          filterFunction: config.filterFunction ? config.filterFunction : () => true
        });

        application.register('iv:navigationItemsProvider', application.navigationItemsProvider, {
          instantiate: false,
          singleton: true
        });
        application.inject('controller', 'navigationItemsProvider', 'iv:navigationItemsProvider');
        application.inject('route', 'navigationItemsProvider', 'iv:navigationItemsProvider');
      });
    });
  }
};
