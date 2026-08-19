import sys
from api import process_retrieve, QueryRequest, retrieve_context

def check_scores():
    q = "asdfjklqwertyuiopzxcvbnm"
    res, _ = retrieve_context(q)
    print(f"Top score for '{q}': {res[0].score if res else 'None'}")
    
    q2 = "completely unrelated non existent topic about aliens eating purple hats"
    res2, _ = retrieve_context(q2)
    print(f"Top score for '{q2}': {res2[0].score if res2 else 'None'}")
    
if __name__ == "__main__":
    check_scores()
