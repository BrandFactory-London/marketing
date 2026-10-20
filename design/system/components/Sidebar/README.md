The sidebar is the app's only global navigation, fixed at 240px on the left.

- Structure: `bfm-nav` holding `bfm-nav-brand`, optional `bfm-nav-section` labels and `bfm-nav-item` links. Mark the current page with `aria-current="page"`.
- Items, in order: Home, Clients, Batches, Review queue (with a `bfm-nav-count`), then a Settings section.
- The consumer provides the links, counts and the current page.
- Below 900px wide the sidebar collapses into a top bar with a menu button.
