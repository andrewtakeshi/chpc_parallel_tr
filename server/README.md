## Folder Structure

- api.py: Flask app used to host a REST API with which users (most typically the accompanying frontend to this project) can query to run traceroutes.
- d3_conversion.py: Code pertaining to converting traceroute output to format ingestible by d3. Functions here should return a python dictionary which is then converted to actual JSON inside of api.py. The about page (about.html) contains the basic structure of the expected JSON. 
- d3_conversion_utils.py: Code common to other files. 
- d3_geo_ip.py: Code pertaining to adding geoIP information to d3 JSON. 
- d3_netbeam.py: Code pertaining to adding ESNet Netbeam API information to d3 JSON. 
- d3_rdap.py: Code pertaining to adding RDAP lookup results (org & domain) to d3 JSON.
- test.py: Used for testing - not commented well. It exists because I got tired of making a new file every time I wanted to test something.

## Comments

- Most of the files contain multiple ways of doing the same thing; this is demonstrated primarily by the inclusion of single and multithreaded implementations of (almost) every function. In other cases, the functions achieve the same result but use different libraries (i.e. icmplib traceroutes) or services (i.e. whois vs RDAP). 
- Future services should be added in a similar fashion, i.e. the service should be added as it's own file. Main functions should accept d3_json as a parameter and modify the dictionary in place.
- Threaded functions have been split into two parts - the called function (spawns the threads) and thread work functions. These thread work functions are designated by the *_tw suffix. In general, the basic structure used in all the called functions should be adaptable to most use cases, although it's acceptable to deviate from this if necessary.

## Demonstration Sites

- 134.55.200.107: ESNet site. Goes through SIX (which also has Netbeam info) and 4 additional Netbeam enabled nodes. 
- 8.8.8.8: Google DNS. This is used to demonstrate one of the key features of this project, the parallelization. By running multiple traceroutes here, we can view the load balancing done by seeing how many different paths are taken to the same IP address.
    - This hasn't been working recently, and I'm not sure why.

## Getting Started

- [UU DataVis Course](https://www.dataviscourse.net/2020/schedule/) - I highly recommend this. Prof. Lex does an excellent job of making D3 accessible and easy to understand. Hopefully the videos stay online, but if they go down for whatever reason the D3 related pages linked in the schedule should stay up and be accessible. 
- [D3 API Reference](https://github.com/d3/d3/blob/main/API.md) - If you have questions on how to use something, the API reference is a good place to start. Each submodule (i.e. d3-geo) is also linked here, so it's easier to go here and search than to try and track down the appropriate submodule.
- I don't have any particularly great examples; however, if you search what you're trying to do, typically [bost.ocks.org](https://bost.ocks.org/mike/) (created by Mike Bostock, the creator of D3) has good examples. I think starting with D3V5 he has been putting more of his work on [Observable](https://observablehq.com/@mbostock), so that's a good place to look as well. The D3 community has done incredible things with the library, so it's hard to find something that someone somewhere hasn't already tried to do (or at least something similar). 
- For Python, I recommend that you use PyCharm. The community version is free, but as a student Jetbrains allows access to the professional version. 
- If you use a virtual environment with python (highly recommended) you can install all the required packages by loading the venv and running `pip3 install -r requirements.txt` while in the root folder of this project. For reference, I have been using Python3.6, although newer versions should also work.
    
## Deployment Instructions (network-viz)

```shell script
cd /var/www/html/
# Clear out all the contents of demo.bak then back up demo.
rm -rf demo.bak/*
\cp -rf demo/* demo.bak
cd demo
# Update demo
git pull
# Make api.wsgi executable
chmod +x api.wsgi
# Make interfaces.json read/write accessible to everyone
chmod 666 interfaces.json
```
Use your favorite text editor to change `/var/www/html/demo/scripts/library` to point to the correct API server address. If deploying on network-viz this can be done by uncommenting the first line and commenting out the second; however, on other systems the actual API server will need to be specified.
```
systemctl restart httpd
```

If you run into any issues testing the API endpoint separately is a good place to start (located on port 8081). From there, reading the log (`/var/log/httpd/error.log`) should be enough to find the source of any issues. 

## Future Steps

There are lots of things left to do with this project; when I was going through and adding some basic documentation I left TODOs in places where there are potential improvements, additions, and bugs. The following lists are places that I think are the most important; however, Joe should be able to give some more guidance as to where time should be spent. 

### Core (Backend)
- Fix pScheduler on network-viz. This has been on the backburner for me for a while, but it's something that needs to be done. If you talk to Paul he should be able to help or do it for you. 
- Read configuration settings from a config file. This will help in making this more portable and potentially something that could be containerized.
    - Examples of these settings include the API server address, the timeout periods, the default location used for geoIP lookups, and the number of max allowable traceroutes, among other things.
- Find a better way to run the traceroutes. Currently subprocesses are being used but it's difficult to get truly parallel performance out of them. Additionally, if more than 5ish traceroutes are run simultaneously the data becomes unusable for the later traceroutes. I looked into using icmplib, but that has it's own set of issues; namely, routing was almost always the same and things like load balancing weren't shown. 
- Add support for different traceroute methods and implementations (i.e. ICMP, TCP, Paris); this should be relatively simple, but depending on the return format additional processing may need to be done. 

### Visualization (Frontend)
- Find a way to limit searches for the GRNOC iframes. Right now it checks the first octet in the IP address, but this can be further limited by using something like a regex.
- Make GRNOC iframes more reliable. Sometimes they load and other times they don't. 
- Add a visual indicator to show that the visualization is processing; currently, the traceroute finishes and it takes several seconds for the visualization to show up. Similarly, optimizing the visualization (i.e. replacing remove/readd calls with joins, if possible) could help with this.
- Add a way to collapse expanded nodes back into their org WITHOUT completely refreshing the visualization.
- Stop updates on single org nodes from updating the entire visualization when "expanded".