# Temporal analysis of network routes for scientific data transfers

## Service overview (U of U CHPC perspective)

![](images/dt-na_architecture.png)

## Dataflow diagram

![](images/dt-na_dataflow.png)

## Scope

* Focused primarily on general-purpose research computing applications, specifically large scientific data transfers between geographically distant cooperating institutions
* Not a general internet topology tool (e.g. [CAIDA ITDK](https://www.caida.org/data/internet-topology-data-kit/))

## Tentative feature list

* A custom Globus transfer interface that interacts with [perfSONAR pSchedulers](https://docs.perfsonar.net/pscheduler_intro.html) at transfer endpoints to gather route diagnostics
* Drivers/glue for database access to [perfSONAR Esmond](https://docs.perfsonar.net/esmond_api_rest.html) and telemetry timeseries databases
* Custom interactive web visualizations in [d3.js](https://d3js.org/)
* An authenticated science gateway (website) that brings everything together

## Resources

perfSONAR: https://www.perfsonar.net/about/what-is-perfsonar/

Center for Applied Internet Data Analysis (CAIDA) @ UCSD: https://www.caida.org/home/

GlobalNOC @ Indiana University: https://globalnoc.iu.edu/


