import Ember from 'ember';
import log from 'log';
import { TransitionMonitoringSupport } from 'ember-vcl-transition-monitoring-support';
import {isChild, isAncestor, selectAndOpenAncestors} from './tree-utils';

export default Ember.Object.extend(Ember.Evented, TransitionMonitoringSupport, {
  container: null,
  navigations: null,
  filteredNavigations: null,
  pages: null,
  selectedItems: [],
  useSlug: false,
  pagesMap: Ember.Map.create(),
  navigationMap: Ember.Map.create(),
  itemMap: Ember.Map.create(),
  filterFunction: () => true,
  localize: (l) => l,

  /**
  * Main method updates all needed data: filteredNavigations, pagesMap,
  * navigationMap and itemMap
  */
  updateMaps: function () {
    var navigations = this.get('navigations');
    // requires filtering because source data may contain duplicates
    // (e.g. similar nav items for different media)
    var filteredNavigations = navigations.filter(this.get('filterFunction'));
    this.set('filteredNavigations', filteredNavigations);
    Ember.run.once(this, function () {
      this.updatePagesMap();
      this.updateNavigationMap();
      this.updateItemMap();
    });
  }.observes('navigations'),

  /**
  * Creates pagesMap: page.id => page
  */
  updatePagesMap: function() {
    var pages = this.get('pages');
    var pagesMap = Ember.Map.create();
    pages.forEach((page) => pagesMap.set(page['@id'], page));
    this.set('pagesMap', pagesMap);
  },

  /**
  * Creates navigationMap navigation.id => navigation
  */
  updateNavigationMap: function() {
    var navigationMap = Ember.Map.create();
    var pagesMap = this.get('pagesMap');
    var navigations = this.get('filteredNavigations');
    navigations.forEach((nav) => navigationMap.set(nav['@id'], nav));
    this.set('navigationMap', navigationMap);
  },

  /**
  * Creates item map: path => nav item
  */
  updateItemMap: function() {
    var thiz = this;
    var navigations = this.get('filteredNavigations');
    var pagesMap = this.get('pagesMap');
    var itemMap = Ember.Map.create();
    var insert = function(item) {
      var path = thiz.createPath(item);
      itemMap.set(path, item);
      if (item.items instanceof Array) {
        item.items.forEach(function(item) {
          insert(item);
        });
      }
    };
    navigations.forEach((navigation) => {
      if (navigation.items) {
        navigation.items.forEach((item) => {
          insert(item);
          if (item.page) {
            var page = pagesMap.get(item.page);
            if (page.type === 'index' && page.subPages instanceof Array) {
              page.subPages.forEach((subId) => {
                var subPage = pagesMap.get(subId);
                var path = '/' + page.name + '/' + subPage.name;
                itemMap.set(path, item);
              });
            }
          }
        });
      }
    });
    thiz.set('itemMap', itemMap);
  },

  handleSelection: function(item) {
    var wasOpened = Ember.get(item, 'opened');
    // if item is already selected, see `else` stmt
    if (this.get('currentItem') !== item) {
      var selected = this.get('selectedItems');
      var toRemove = [];
      selected.forEach((selectedItem) => {
        if (!isAncestor(item, selectedItem)) {
          Ember.set(selectedItem, 'selected', false);
          Ember.set(selectedItem, 'opened', false);
          toRemove.push(selectedItem);
        }
      });
      toRemove.forEach(function(remove) {
        var index = selected.indexOf(remove);
        selected.splice(index, 1);
      });
      Ember.set(item, 'selected', true);
      if (item.items instanceof Array) {
        if (wasOpened) {
          Ember.set(item, 'opened', false);
        } else {
          Ember.set(item, 'opened', true);
        }
      }
      this.set('currentItem', item);
      selected.push(item);
      selectAndOpenAncestors(item, selected);
      this.set('selectedItems', selected);
    } else {
      // toggles the `opened` state if the item is already selected
      if (wasOpened) {
        Ember.set(item, 'opened', false);
      } else {
        Ember.set(item, 'opened', true);
      }
    }

  },

  pathChanged: function(path) {
    var navs = this.get('navigations');

    // TODO refactor or remove
    var invend = {
      authN: this.get('authN')
    };
    var processActive = function(item) {
      var makeScope = function(invend) {
        return function(item) {
          Ember.set(item, 'active', eval(item.evalActive));
        };
      };
      if (typeof item.evalActive === 'string') {
        makeScope(invend)(item);
      }
      return item;
    };

    navs.forEach(function(item) {
      item.items.forEach(function(i) {
        processActive(i);
      });
    });

    this.notifyPropertyChange('navigations');

    Ember.run.next(this, function () {
      log.debug('Path changed to \'' + path + '\'');
      var itemMap = this.get('itemMap');
      var item = itemMap.get(path);
      if (item) {
        if (!this.get('currentItem') || this.get('currentItem')['@id'] !== item['@id']) {
          log.debug('Selection handled for path ' + path);
          this.handleSelection(item);
        }
      } else {
        // TODO: is this branch of code needed?
        var initialPath = path;
        var pathElems = path.split('/');
        pathElems.shift();
        var handled = false;
        while (pathElems.length > 0) {
          path = '';
          pathElems.pop();
          pathElems.forEach(function(elem) {
            path += '/' + elem;
          });
          item = itemMap.get(path);
          if (item) {
            var left = initialPath.replace(path + '/', ''); // Firefox Hack. Trying to hash the rest of the URL
            var newPath = path + '/' + encodeURIComponent(left);
            var newItem = itemMap.get(newPath);
            if (newItem) {
              log.debug('Selection handled for path ' + newPath);
              this.handleSelection(newItem);
              handled = true;
            } else {
              log.debug('Selection handled for path ' + path);
              this.handleSelection(item);
              handled = true;
            }
            break;
          }
        }
        if (!handled) {
          this.handleSelection({});
        }
      }
    })
  }.on('currentPathDidChange'),

  /**
  * Takes a nav item and builds the corresponding path.
  * The path equals the Ember route.
  * Replaces dynamic segments of the route with actual item values.
  */
  buildPathFromItem: function(item) {
    var thiz = this;
    var page = this.get('pagesMap').get(item.page);
    var path = page.path;
    if (path.indexOf(':') !== -1) {
      var pathItems = page.path.split('/');
      pathItems.shift();
      path = '';
      var params = {};
      pathItems.forEach(function(pathItem) {
        var colonIndex = pathItem.indexOf(':');
        if (colonIndex === -1) {
          path += '/' + pathItem;
        } else {
          var slug = item.slug;
          path += '/' + encodeURIComponent((thiz.useSlug && slug) ? thiz.localize(slug, thiz.get('l10n').get('locale')) : item['@id']);
        }
      });
    }
    return path;
  },

  createPath: function(item) {
    var path = item.page ? this.buildPathFromItem(item) : item.href;
    Ember.set(item, 'path', path);
    Ember.set(item, 'href', '/#!' + path);
    return path;
  },

  pathExists: function(path, item) {
    var page = this.get('pagesMap').get(item.page);
    if (page.path.split('/').length === path.split('/').length) {
      return true;
    }
    return false;
  },

  handleNavItem: function(item) {
    log.debug('Handling nav item', item);
    this.handleSelection(item);
    this.get('container').lookup('route:application').transitionTo(item.path);
  },

  getItemsByIri: function (iri) {
    if (this.get('navigationMap').get(iri)) {
      return this.get('navigationMap').get(iri).items;
    } else {
      return [];
    }
  }

});
