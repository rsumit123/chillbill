from typing import Dict, List


def settlement_suggestions(balances: Dict[int, float]) -> List[dict]:
    """Greedy min-transactions suggestion. Pairs largest creditor with
    largest debtor until balances zero out (within float tolerance).

    Input keys and output ``from_member_id``/``to_member_id`` are
    ``group_members.id`` integers.
    """
    creditors: list[list] = []
    debtors: list[list] = []
    for mid, bal in balances.items():
        if bal > 0.005:
            creditors.append([mid, bal])
        elif bal < -0.005:
            debtors.append([mid, -bal])
    creditors.sort(key=lambda x: x[1], reverse=True)
    debtors.sort(key=lambda x: x[1], reverse=True)

    transfers: List[dict] = []
    i = j = 0
    while i < len(creditors) and j < len(debtors):
        c_id, c_amt = creditors[i]
        d_id, d_amt = debtors[j]
        amt = round(min(c_amt, d_amt), 2)
        if amt <= 0:
            break
        transfers.append({"from_member_id": d_id, "to_member_id": c_id, "amount": amt})
        c_amt -= amt
        d_amt -= amt
        if c_amt <= 0.005:
            i += 1
        else:
            creditors[i][1] = c_amt
        if d_amt <= 0.005:
            j += 1
        else:
            debtors[j][1] = d_amt
    return transfers
