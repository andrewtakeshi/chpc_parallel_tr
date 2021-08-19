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
- 
