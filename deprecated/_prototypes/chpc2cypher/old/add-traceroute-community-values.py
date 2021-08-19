from neo4j import GraphDatabase

def main():
    conn = GraphDatabase.driver("bolt://localhost:7687", auth=("neo4j", "test"))
    with conn.session() as cursor:
        res = cursor.run("MATCH (n:Server) RETURN DISTINCT n.orgname")
        orgnames = [rec["n.orgname"] for rec in res]
        for i, name in enumerate(orgnames):
            cursor.run(f"MATCH (n:Server) WHERE n.orgname='{name}' SET n.community={i}")

    conn.close()

if __name__ == '__main__':
    main()
