# MongoDB _id Type Checker for mongosync Performance Analysis

This script analyzes **MongoDB collections** for non-ObjectId `_id` types and insertion-order correlation patterns, predicting potential **mongosync migration performance issues** and providing optimization recommendations.

## Purpose

Identifies collections that may cause **poor performance during mongosync migrations** due to:
- Non-sequential `_id` values (UUIDs, random strings, etc.)
- Scattered disk layout causing excessive I/O during migration
- Need for `copyInNaturalOrder` optimization in mongosync 1.16.0+

## Important: Production Impact Warning

**This script performs intensive operations that can impact production performance:**
- Multiple `countDocuments()` queries per collection
- Natural order sorting operations (`$natural: 1`) that cannot use indexes
- Sampling up to 1000 documents per non-ObjectId type per collection

## Quick Start

### Recommended: Pre-Production/Staging Environment

**BEST PRACTICE:** Run this script on a **staging/pre-production environment** that has the **same data structure** as production:

```bash
# Run in the staging environment
mongosh "mongodb://test:test@localhost:27017,localhost:27018,localhost:27019/admin?replicaSet=replset"   mongodb_id_checker.js
```
- Adjust the connection string to suit your environment.

**Why staging is strongly recommended:**
- Zero impact on production workloads
- Same schema and data patterns as production
- Complete analysis of all collections
- Safe to run multiple times for testing
- No performance degradation concerns

### Production Environment (Use with Extreme Caution)

**⚠️ Only if staging is not available and you understand the risks:**

#### Run on it on a secondary Replica (Least Risky)
```bash

# Run the script E.g:
 mongosh "mongodb://user:password@localhost:27017,localhost:27018,localhost:27019/admin?replicaSet=replset&readPreference=secondary"   mongodb_id_checker.js
```
- Adjust the connection string to suit your environment.

## Sample Output

```javascript
=============================================================
MONGOSYNC PERFORMANCE ANALYSIS - Non-ObjectId Collections
=============================================================

{
  namespace: 'ecommerce.orders',
  id_types: {
    String: {
      count: 50000,
      is_sequential: false,
      pattern: "UUID",
      sample_ids: [
        "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        "2d5e8c6f-3b1a-4a8d-9c2e-7f1b5d8a9e3c",
        "8f2e4b7a-1c3d-4e5f-9a8b-6c7d8e9f0a1b"
      ]
    }
  }
}

=============================================================
MONGOSYNC PERFORMANCE SUMMARY:
⚠️  SLOW MIGRATION EXPECTED for 1 collections:
   - ecommerce.orders (String:UUID)

💡 PERFORMANCE OPTIMIZATION OPTION:
   Starting in mongosync 1.16.0, use the "copyInNaturalOrder"
   parameter in the /start API endpoint. This copies data in natural
   sort order which may improve performance for the collection(s) above with
   non-sequential _id values by reducing scattered disk reads.
   Reference: https://www.mongodb.com/docs/mongosync/current/release-notes/1.16/
```

## Script Behavior

The script operates with these default settings:
- **Analyzes all databases** (except admin, config, local)
- **Checks all collections** in each database
- **Samples up to 1000 documents** per non-ObjectId type for sequential analysis
- **Uses natural order** (`$natural: 1`) to check insertion-order correlation
- **Shows sample _id values** (up to 8) for non-sequential collections


## Understanding Results

### Collection Analysis
- **`count`**: Number of documents with this `_id` type
- **`is_sequential`**: Whether `_id` values correlate with insertion order
- **`pattern`**: For strings - "UUID", "Numeric", or "Other"
- **`sample_ids`**: Example `_id` values showing the pattern

### Performance Impact
| Pattern | mongosync Performance | Recommendation |
|---------|----------------------|----------------|
| **`is_sequential: true`** |  Efficient | Standard migration |
| **`is_sequential: false`** | Slower | Use `copyInNaturalOrder` |


## File Structure

```
mongodb_id_checker/
├── mongodb_id_checker.js    # Main analysis script (NO safety features)
└── README.md               # This documentation
```

Running this analysis on staging early in your migration planning process will save time, resources, and avoid production risks.

## DISCLAIMER
Please note: all tools/ scripts in this repo are released for use "AS IS" without any warranties of any kind, including, but not limited to their installation, use, or performance. We disclaim any and all warranties, either express or implied, including but not limited to any warranty of noninfringement, merchantability, and/ or fitness for a particular purpose. We do not warrant that the technology will meet your requirements, that the operation thereof will be uninterrupted or error-free, or that any errors will be corrected.

Any use of these scripts and tools is at your own risk. There is no guarantee that they have been through thorough testing in a comparable environment and we are not responsible for any damage or data loss incurred with their use.

You are responsible for reviewing and testing any scripts you run thoroughly before use in any non-testing environment.

Thanks,
The MongoDB Support Team