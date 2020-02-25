#!/usr/bin/python3
import sys
import csv

fieldnames = ["JobID","Cluster","Partition","Account","User","Submit","Start","End","State","NCPUS","ReqCPUS","ReqMem","ReqGRES","Timelimit","NodeList","JobName"]

def main(sacctfd):
    with open(sacctfd, mode='r') as sacct:
        sacctreader = csv.DictReader(sacct,fieldnames,delimiter='|')

        for row in sacctreader:
            print(f"MERGE (job:Job {{"
                  f"jobid:\'{row['JobID']+'-'+row['Cluster']}\',"
                  f"submit:\'{row['Submit']}\',"
                  f"start:\'{row['Start']}\',"
                  f"end:\'{row['End']}\',"
                  f"ncpus:\'{row['NCPUS']}\',"
                  f"reqcpus:\'{row['ReqCPUS']}\',"
                  f"reqmem:\'{row['ReqMem']}\',"
                  f"reqgres:\'{row['ReqGRES']}\',"
                  f"timelimit:\'{row['Timelimit']}\',"
                  f"jobname:\'{row['JobName']}\'"
                  f"}})")
            for hostname in row["NodeList"].split(','):
                print(f"MERGE ({hostname}:Server {{hostname:\'{hostname}\', purpose:\'compute\'}})")
                print(f"MERGE (job)-[:RAN_ON]->({hostname})")
            print(f"MERGE (user:User {{name:\'{row['User']}\'}})")
            print(f"MERGE (user)-[:SUBMITTED {{partition:\'{row['Partition']}\'}}]->(job)")
            print(f"MERGE (acct:SlurmAccount {{name:\'{row['Account']}\'}})")
            print(f"MERGE (job)-[:USED_ALLOCATION]->(acct)")
            print(";")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        sacctfd = sys.argv[1]
    else:
        sacctfd = 0  #stdin

    main(sacctfd)
