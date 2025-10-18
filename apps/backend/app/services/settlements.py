from typing import Dict, List


def settlement_suggestions(balances: Dict[str, float]) -> List[dict]:
    creditors = []
    debtors = []
    for user_id, bal in balances.items():
        if bal > 0:
            creditors.append([user_id, bal])
        elif bal < 0:
            debtors.append([user_id, -bal])
    creditors.sort(key=lambda x: x[1], reverse=True)
    debtors.sort(key=lambda x: x[1], reverse=True)

    transfers: List[dict] = []
    i = j = 0
    while i < len(creditors) and j < len(debtors):
        c_id, c_amt = creditors[i]
        d_id, d_amt = debtors[j]
        amt = min(c_amt, d_amt)
        transfers.append({"from_user_id": d_id, "to_user_id": c_id, "amount": round(amt, 2)})
        c_amt -= amt
        d_amt -= amt
        if c_amt == 0:
            i += 1
        else:
            creditors[i][1] = c_amt
        if d_amt == 0:
            j += 1
        else:
            debtors[j][1] = d_amt
    return transfers
