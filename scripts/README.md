## Contents

- forcemap.js - This does all the visualization related work. A forcemap is the combined map and force graph visualization. It also handles all of the auxiliary visualization code, i.e. visualizing the Netbeam graphs.
- index.js - This holds UI related functions, i.e. handlers for UI interactions.
- library.js - A bit less focused than the other two files, but it's best categorized as auxiliary functions for the forcemap. These are things that we do to improve the forcemap but aren't inherently part of it, i.e. categorizing the traceroute data into orgs before sending to the forcemap.

Overall there's a bit of overlap between the ideology/placement of functions for `index.js` and `library.js`. They can and at some point should probably be cleaned up and further separated, or more likely, just combined.

The forcemap is commented relatively well, and there are `TODO`'s scattered throughout that highlight needed work (i.e. better way of identifying GRNOC nodes). The work that Paul has done in creating the org clusters isn't commented super well, mainly because I don't understand it super well.


