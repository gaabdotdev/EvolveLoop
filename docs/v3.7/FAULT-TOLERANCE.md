# Fault Tolerance

Distributed leases with monotonic fencing epochs. Expiry marks lease expired without claiming process death. Steal revokes old lease and issues new epoch; stale submit rejected.
