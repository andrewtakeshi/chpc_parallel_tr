
CREATE
    (NotchRM:Server {hostname:'notchrm.int.chpc.utah.edu', purpose:'service'}),
    (Notchpeak1:Server {hostname:'notchpeak1.int.chpc.utah.edu', purpose:'interactive'}),
    (Notchpeak2:Server {hostname:'notchpeak2.int.chpc.utah.edu', purpose:'interactive'})

CREATE
    (Notch001:Server {hostname:'notch001.int.chpc.utah.edu', purpose:'compute'}),
    (Notch002:Server {hostname:'notch002.int.chpc.utah.edu', purpose:'compute'}),
    (Notch003:Server {hostname:'notch003.int.chpc.utah.edu', purpose:'compute'}),
    (Notch004:Server {hostname:'notch004.int.chpc.utah.edu', purpose:'compute'}),
    (Notch005:Server {hostname:'notch005.int.chpc.utah.edu', purpose:'compute', model:'Dell EMC R440'}),
    (Notch006:Server {hostname:'notch006.int.chpc.utah.edu', purpose:'compute', model:'Dell EMC R440'}),
    (Notch007:Server {hostname:'notch007.int.chpc.utah.edu', purpose:'compute', model:'Dell EMC R440'}),
    (Notch008:Server {hostname:'notch008.int.chpc.utah.edu', purpose:'compute', model:'Dell EMC R440'})

CREATE
    (DDC_U10:Rack {name:'Rack U-10'}),
    (DDC_U11:Rack {name:'Rack U-11'}),
    (DDC_ES_TOR_U10_1:Router {name:'ddc-es-tor-u10-1', type:'ethernet'}),
    (DDC_IB_TOR_U10_1:Router {name:'ddc-ib-tor-u10-1', type:'infiniband'}),
    (DDC_Infra_PDU_U10_1:PDU {name:'ddc-infra-pdu-u10-1'}),
    (DDC_ES_TOR_U11_1:Router {name:'ddc-es-tor-u11-1', type:'ethernet'}),
    (DDC_IB_TOR_U11_5:Router {name:'ddc-ib-tor-u11-5', type:'infiniband'}),
    (DDC_Infra_PDU_U11_1:PDU {name:'ddc-infra-pdu-u11-1'})

// Let's rack what we have for U10
CREATE
    (DDC_ES_TOR_U10_1)-[:RACKED_IN {top:48, size:1}]->(DDC_U10),
    (DDC_IB_TOR_U10_1)-[:RACKED_IN {top:44, size:1}]->(DDC_U10),
    (DDC_Infra_PDU_U10_1)-[:RACKED_IN]->(DDC_U10),
    (Notch001)-[:RACKED_IN {top:42, size:2}]->(DDC_U10),
    (Notch002)-[:RACKED_IN {top:40, size:2}]->(DDC_U10),
    (Notch003)-[:RACKED_IN {top:38, size:2}]->(DDC_U10),
    (Notch004)-[:RACKED_IN {top:36, size:2}]->(DDC_U10),
    (Notch005)-[:RACKED_IN {top:34, size:1}]->(DDC_U10),
    (Notch006)-[:RACKED_IN {top:33, size:1}]->(DDC_U10),
    (Notch007)-[:RACKED_IN {top:32, size:1}]->(DDC_U10),
    (Notch008)-[:RACKED_IN {top:31, size:1}]->(DDC_U10)

// Racking U11
CREATE
    (DDC_ES_TOR_U11_1)-[:RACKED_IN {top:48, size:1}]->(DDC_U11),
    (DDC_IB_TOR_U11_5)-[:RACKED_IN {top:37, size:1}]->(DDC_U11),
    (DDC_Infra_PDU_U11_1)-[:RACKED_IN]->(DDC_U11),
    (NotchRM)-[:RACKED_IN {top:35, size:1}]->(DDC_U11),
    (Notchpeak1)-[:RACKED_IN {top:34, size:1}]->(DDC_U11),
    (Notchpeak2)-[:RACKED_IN {top:33, size:1}]->(DDC_U11)

// People and Organizations
CREATE
    (PaulF:Person {name:'Paul J. Fischer', unid:'u0770441'}),
    (BrianH:Person {name:'Brian D. Haymore', unid:'u0104663'}),
    (JakeE:Person {name:'Jacob J. Evans', unid:'u0852540'}),
    (AlanW:Person {name:'Alan S. Wisniewski', unid:'u0293320'}),
    (CHPC:Organization {name:'Center for High Performance Computing'}),
    (UofU:Organization {name:'University of Utah'})
CREATE
    (PaulF)-[:MEMBER_OF {role:'Systems Administrator'}]->(CHPC),
    (BrianH)-[:MEMBER_OF {role:'Systems Administrator'}]->(CHPC),
    (JakeE)-[:MEMBER_OF {role:'Network Administrator'}]->(CHPC),
    (AlanW)-[:MEMBER_OF {role:'Technical Support Analyst'}]->(CHPC),
    (CHPC)-[:MEMBER_OF]->(UofU)

// Physical locations
CREATE
    (DDCComputeRoom2:Room {name:'DDC Compute Room 2'}),
    (DDC:Site {name:'Downtown Data Center'}),
    (INSCC:Site {name:'Intermountain Network Scientific Computing Center'}),
    (UofUCampus:Site {name:'University of Utah Main Campus'}),
    (SaltLakeCity:City {name:'Salt Lake City'})
CREATE
    (DDC_U10)-[:LOCATED_IN]->(DDCComputeRoom2),
    (DDC_U11)-[:LOCATED_IN]->(DDCComputeRoom2),
    (DDCComputeRoom2)-[:LOCATED_IN]->(DDC),
    (DDC)-[:LOCATED_IN]->(SaltLakeCity),
    (INSCC)-[:LOCATED_IN]->(UofUCampus),
    (UofUCampus)-[:LOCATED_IN]->(SaltLakeCity)
//Note: could simplify geospacial hierarchy by replacing Room and/or City with Site, as long as identifiers are clear

// Additional relationships
CREATE
    (DDC_U10)-[:ADJACENT_TO]->(DDC_U11),
    (:Sensor {name:'environmental sensor 1'})-[:ADJACENT_TO]->(DDC_U10),
    (DDC_ES_TOR_U10_1)-[:CONTACT_PERSON {primary:true}]->(JakeE),
    (DDC_IB_TOR_U10_1)-[:CONTACT_PERSON {primary:true}]->(JakeE),
    (DDC_ES_TOR_U11_1)-[:CONTACT_PERSON {primary:true}]->(JakeE),
    (DDC_IB_TOR_U11_5)-[:CONTACT_PERSON {primary:true}]->(JakeE),
    (DDC_Infra_PDU_U10_1)-[:CONTACT_PERSON {primary:true}]->(AlanW),
    (DDC_Infra_PDU_U11_1)-[:CONTACT_PERSON {primary:true}]->(AlanW),
    (Notchpeak)-[:CONTACT_PERSON {primary:true}]->(BrianH),
    (NotchRM)-[:CONTACT_PERSON {primary:true}]->(BrianH),
    (Notchpeak1)-[:CONTACT_PERSON {primary:true}]->(BrianH),
    (Notchpeak2)-[:CONTACT_PERSON {primary:true}]->(BrianH),
    (Notch001)-[:CONTACT_PERSON {primary:true}]->(BrianH),
    (Notch002)-[:CONTACT_PERSON {primary:true}]->(BrianH),
    (Notch003)-[:CONTACT_PERSON {primary:true}]->(BrianH),
    (Notch004)-[:CONTACT_PERSON {primary:true}]->(BrianH),
    (Notch005)-[:CONTACT_PERSON {primary:true}]->(BrianH),
    (Notch006)-[:CONTACT_PERSON {primary:true}]->(BrianH),
    (Notch007)-[:CONTACT_PERSON {primary:true}]->(BrianH),
    (Notch008)-[:CONTACT_PERSON {primary:true}]->(BrianH),
    (Habanero:Server {hostname:'habanero.chpc.utah.edu', purpose:'desktop'}),
    (Habanero)-[:CONTACT_PERSON {primary:true}]->(PaulF)

// Example PI stuff
CREATE
    (PFischerProject:ResearchProject {name:'PFischer Primary Project'}),
    (PaulF)-[:MEMBER_OF {role:'Principal Investigator'}]->(PFischerProject),
    (SomeGradStudent:Person {name:'A Grad Student', unid:'u12345678'})-[:MEMBER_OF {role:'Researcher'}]->(PFischerProject),
    (PFischerSlurmAcct:SlurmAccount {name:'pfischer', allocation:10000, remaining:1234}),
    (PFischerSlurmAcct)-[:ALLOCATED_FOR]->(PFischerProject),
    (Notchpeak2)-[:OWNED_BY]->(PaulF),
    (NPJob12345:Job {name:'notchpeak-12345',
                 submitted:'2019-09-12T15:05:00',
                 start:'2019-09-12T15:05:50',
                 end:'2019-09-12T15:10:00',
                 reqmem:'2000'}),
    (NPJob12345)-[:USING_ALLOCATION]->(PFischerSlurmAcct),
    (NPJob12345)-[:SUBMITTED_BY {partition:'np-general'}]->(SomeGradStudent),
    (NPJob12345)-[:RAN_ON]->(Notch003),
    (NPJob12345)-[:RAN_ON]->(Notch004),
    (DeepLearningPaper:Publication {name:'Fancy Deep Learning Title', doi:'10.1000/182'}),
    (DeepLearningGrant:Grant {name:'NSF Grant OCI 1234567', amount:1000000}),
    (PFischerProject)-[:FUNDED_BY]->(DeepLearningGrant),
    (PFischerProject)-[:PRODUCED]->(DeepLearningPaper),
    (PaulF)-[:AUTHORED {primary:true}]->(DeepLearningPaper),
    (SomeGradStudent)-[:AUTHORED {primary:false}]->(DeepLearningPaper)

CREATE
    (GWCompute:Router {ipv4addr:'10.242.128.1'}),
    (GWHPC:Router {hostname:'gw-hpc.chpc.utah.edu', ipv4addr:'155.101.26.1'}),
    (GWDDCINSCC:Router {hostname:'rt-inscc-ddc-core.chpc.utah.edu', ipv4addr:'155.101.1.1'}),
    (GWHPC)-[:LINK {speed_gb:100, family:'ethernet'}]->(GWDDCINSCC),
    (Notch001)-[:LINK {speed_gb:10, family:'ethernet'}]->(GWCompute),
    (Notch002)-[:LINK {speed_gb:10, family:'ethernet'}]->(GWCompute),
    (Notch003)-[:LINK {speed_gb:10, family:'ethernet'}]->(GWCompute),
    (Notch004)-[:LINK {speed_gb:10, family:'ethernet'}]->(GWCompute),
    (Notch005)-[:LINK {speed_gb:10, family:'ethernet'}]->(GWCompute),
    (Notch006)-[:LINK {speed_gb:10, family:'ethernet'}]->(GWCompute),
    (Notch007)-[:LINK {speed_gb:10, family:'ethernet'}]->(GWCompute),
    (Notch008)-[:LINK {speed_gb:10, family:'ethernet'}]->(GWCompute),
    (Notchpeak1)-[:LINK {speed_gb:100, family:'ethernet'}]->(GWCompute),
    (Notchpeak2)-[:LINK {speed_gb:100, family:'ethernet'}]->(GWCompute),
    (Notchpeak1)-[:LINK {speed_gb:100, family:'ethernet'}]->(GWHPC),
    (Notchpeak2)-[:LINK {speed_gb:100, family:'ethernet'}]->(GWHPC),
    (Habanero)-[:LINK {speed_gb:1, family:'ethernet'}]->(GWDDCINSCC)

;

