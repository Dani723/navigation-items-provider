# iv-navigation-items-provider

Provides a component capable of loading and managing navigation resources of the app.

## Usage

By default, the component exports its initializer.
The initializer's name is `navigation-items-provider`. The initializer depends on the following initializers:

 - `resources` [Resources module](https://github.com/Invend/resources)
 - `pages`  [Pages module](https://github.com/Invend/pages)

Additionally, it depends on the default `init` initializer.
These modules are expected to provide the following modules via the initializer input interface:

 - `input.init.api`
 - `input.init.config['navigation-items-provider']`
 - `input.init.l10n`
 - `input.init.authN`
 - `input.init.apiDoc`
 - `input.pages.pages`

The input object is provided by the module (ember-initializer-dm)[https://github.com/n-fuse/ember-initializer-dm].

The `input.init.config['navigation-items-provider']` has the following structure:

```
{
  resources: [
    {
      iri: '/navigations/' // relative IRI to load navigations from
    }
  ],
  useSlug: true, // whether it should try to use the `slug` property to build URLs
  filterFunction: function (i) { // filters the navigation resources, e.g. depending on media queries
    if (!window.matchMedia('(max-width: ' + collapsedView + ')')) {
      return i['@id'].indexOf('drawer') !== -1;
    } else {
      return i['@id'].indexOf('top') !== -1 || i['@id'].indexOf('side') !== -1;
    }
  },
  localize: function(l, locale) { // processing localized attributes in the navigation component
    if (l instanceof Array) {
      for (var i = 0; i < l.length; i++) {
        var item = l[i];
        if (item['@language'] === locale) {
          return item['@value'];
        }
      }
    } else if (typeof l ==='object') {
      if (l[locale]) return l[locale];
    }
    return l;
  }
}
```

The initializer injects a singleton object called `navigationItemsProvider` into every route and controller.
The object exposed a method `getItemsByIri` to get the navigations items:

```
var items = this.get('navigationItemsProvider').getItemsByIri(iri); // iri - full IRI of the nav resource
```

These items can be passed to the `ember-vcl-navigation` component.

Listening to the nav provider updates is also possible:

```
socialNavItems: function() {
  return this.getNavItems(this.getBaseUrl() + '/navigations/social', 0);
}.property('navigationItemsProvider.itemMap'),


navItemChanged: function() {
  var navigationItemsProvider = this.get('navigationItemsProvider');
  var item = navigationItemsProvider.get('currentItem');
  if (item && item.items === undefined) {
    if (this.get('menuVisible')) {
      this.set('menuVisible', false);
    }
  }
}.observes('navigation.currentItem'),

```

##License
[MIT license](LICENSE)
