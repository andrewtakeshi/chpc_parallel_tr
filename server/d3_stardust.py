from elasticsearch import Elasticsearch

es = Elasticsearch(["https://el.gc1.prod.stardust.es.ent:9200"], timeout=60)

res = es.search()