# data-transfer-network-analysis

Temporal analysis of network routes in the context of large and well-defined data transfers.

## Service overview

![](images/dt-na_architecture.png)

## Dataflow diagram

![](images/dt-na_dataflow.png)

## Scope

* Focused primarily on general-purpose research computing applications, specifically large scientific data transfers between geographically distant cooperating institutions
* Not a general internet topology tool (e.g. CAIDA ITDK, https://www.caida.org/data/internet-topology-data-kit/)

## Tentative feature list

* A custom Globus transfer interface that interacts with perfSONAR pSchedulers at transfer endpoints to gather route diagnostics
* * Drivers/glue for database access to perfSONAR Esmond and telemetry timeseries databases
* Custom interactive web visualizations in d3.js
* An authenticated science gateway (website) that brings everything together