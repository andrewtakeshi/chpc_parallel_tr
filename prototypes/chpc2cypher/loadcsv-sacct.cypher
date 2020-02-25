USING PERIODIC COMMIT
LOAD CSV WITH HEADERS FROM "file:///jobs.csv" AS record FIELDTERMINATOR '|'
MERGE (job:Job { jobid: record.Cluster+'-'+record.JobID,
                 submit: record.Submit,
                 start: record.Start,
                 end: record.End,
                 ncpus: record.NCPUS,
                 reqcpus: record.ReqCPUS,
                 reqmem: record.ReqMem,
                 timelimit: record.Timelimit,
                 jobname: record.JobName})
FOREACH (hostname in split(record.NodeList,',') |
    MERGE (server:Server {`hostname`:hostname, purpose:'compute'})
    MERGE (job)-[:RAN_ON]->(server))
MERGE (user:User {name: record.User})
MERGE (user)-[:SUBMITTED {partition: record.Partition}]->(job)
MERGE (acct:SlurmAccount {name: record.Account})
MERGE (job)-[:USED_ALLOCATION]->(acct)
;
