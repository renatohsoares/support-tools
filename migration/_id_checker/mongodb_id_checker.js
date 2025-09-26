function isSequential(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return false;
    for (var i = 1; i < arr.length; i++) {
        if (arr[i] <= arr[i-1]) return false;
    }
    return true;
}

function isSequentialString(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return false;
    var nums = arr.map(function(s) { return Number(s); });
    if (nums.some(isNaN)) return false;
    for (var i = 1; i < nums.length; i++) {
        if (nums[i] <= nums[i-1]) return false;
    }
    return true;
}

function detectStringPattern(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return "unknown";
    
    var sample = arr.slice(0, Math.min(10, arr.length)); // Check first 10 strings
    var uuidCount = 0;
    var numericCount = 0;
    
    sample.forEach(function(str) {
        // UUID pattern: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 chars with dashes)
        // or 32 hex chars without dashes
        if (typeof str === 'string') {
            if (str.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) ||
                str.match(/^[0-9a-f]{32}$/i)) {
                uuidCount++;
            } else if (str.match(/^\d+$/)) {
                numericCount++;
            }
        }
    });
    
    if (uuidCount >= sample.length * 0.8) return "UUID";
    if (numericCount >= sample.length * 0.8) return "Numeric";
    return "Other";
}

function isSequentialDate(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return false;
    var times = arr.map(function(d) { return d.getTime(); });
    for (var i = 1; i < times.length; i++) {
        if (times[i] <= times[i-1]) return false;
    }
    return true;
}

// Official BSON type map (ObjectId is 7)
var typeMap = {
    "Double": 1,
    "String": 2,
    "Object": 3,
    "Array": 4,
    "Binary": 5,
    "Undefined": 6,
    "ObjectId": 7,
    "Boolean": 8,
    "Date": 9,
    "Null": 10,
    "Regex": 11,
    "DBPointer": 12,
    "JavaScript": 13,
    "Symbol": 14,
    "JavaScriptWithScope": 15,
    "Int32": 16,
    "Timestamp": 17,
    "Int64": 18,
    "Decimal128": 19,
    "MinKey": -1,
    "MaxKey": 127
};

var output = [];
var anyNonObjectIdFound = false;

db.getMongo().getDBNames().forEach(function (d) {
    if (["admin", "config", "local"].indexOf(d) !== -1) {
        return; // skip system DBs
    }
    var curr_db = db.getMongo().getDB(d);

    curr_db.getCollectionNames().forEach(function (coll) {
        var result = {
            namespace: d + '.' + coll,
            id_types: {}
        };

        // Collect counts per type first
        Object.keys(typeMap).forEach(function(typeName) {
            var typeNum = typeMap[typeName];
            var count = curr_db.getCollection(coll).countDocuments({ "_id": { $type: typeNum } });
            if (count > 0) {
                result.id_types[typeName] = {
                    count: count,
                    is_sequential: null, // will be filled later
                    pattern: null, // will be filled for String types
                    sample_ids: null // will be filled for non-sequential types
                };
            }
        });

        // If there are only ObjectId _ids, skip adding this collection's result now
        var hasOnlyObjectId =
            Object.keys(result.id_types).length > 0 &&
            Object.keys(result.id_types).every(function(k){ return k === "ObjectId"; });

        if (hasOnlyObjectId) {
            // do not push; we only output non-ObjectId results overall
            return;
        }

        // Otherwise, perform sequential analysis ONLY on non-ObjectId types and capture only those
        Object.keys(result.id_types).forEach(function(typeName) {
            if (typeName === "ObjectId") return; // skip ObjectId entirely

            var typeNum = typeMap[typeName];
            var cursor = curr_db.getCollection(coll)
                .find({ "_id": { $type: typeNum } }, { _id: 1 })
                .sort({ $natural: 1 }) // natural insertion order sampling
                .limit(1000);

            var ids = [];
            cursor.forEach(function(doc) { ids.push(doc._id); });

            if (["Int32", "Int64", "Double", "Decimal128", "Timestamp"].indexOf(typeName) !== -1) {
                var isSeq = isSequential(ids);
                result.id_types[typeName].is_sequential = isSeq;
                if (!isSeq) {
                    result.id_types[typeName].sample_ids = ids.slice(0, 8); // Show first 8 samples
                }
            } else if (typeName === "String") {
                var isSeq = isSequentialString(ids);
                result.id_types.String.is_sequential = isSeq;
                result.id_types.String.pattern = detectStringPattern(ids);
                if (!isSeq) {
                    result.id_types.String.sample_ids = ids.slice(0, 8); // Show first 8 samples
                }
            } else if (typeName === "Date") {
                var isSeq = isSequentialDate(ids);
                result.id_types.Date.is_sequential = isSeq;
                if (!isSeq) {
                    result.id_types.Date.sample_ids = ids.slice(0, 8); // Show first 8 samples
                }
            } else {
                // For types we don't analyze (Binary, Boolean, etc.), mark as not applicable
                result.id_types[typeName].is_sequential = "N/A";
            }
        });

        // Keep only non-ObjectId id_types in the output and clean up fields
        Object.keys(result.id_types).forEach(function(k){
            if (k === "ObjectId") {
                delete result.id_types[k];
            } else {
                // Clean up pattern field for non-strings
                if (k !== "String" && result.id_types[k].pattern !== undefined) {
                    delete result.id_types[k].pattern;
                }
                // Clean up sample_ids for sequential types (we only want to show non-sequential examples)
                if (result.id_types[k].is_sequential === true && result.id_types[k].sample_ids) {
                    delete result.id_types[k].sample_ids;
                }
            }
        });

        // If after pruning there are any types left, record and mark that we have non-ObjectId results
        if (Object.keys(result.id_types).length > 0) {
            anyNonObjectIdFound = true;
            output.push(result);
        }
    });
});

// Final printing logic with mongosync performance context
if (anyNonObjectIdFound) {
    printjson('=============================================================');
    printjson('MONGOSYNC PERFORMANCE ANALYSIS - Non-ObjectId Collections');
    printjson('=============================================================');
    printjson('Collections with is_sequential: false may experience:');
    printjson('- High I/O latency during mongosync migration');
    printjson('- Scattered disk reads (1 page per document)');
    printjson('- Significantly slower migration speeds');
    printjson('');
    printjson('Note: Sample _id values are shown for non-sequential collections');
    printjson('to demonstrate the ordering issue that affects mongosync performance.');
    printjson('=============================================================');
    printjson(" ");
    
    var problematicCollections = [];
    var efficientCollections = [];
    
    output.forEach(function (res) {
        printjson(res);
        
        // Categorize collections for summary
        Object.keys(res.id_types).forEach(function(typeName) {
            var typeInfo = res.id_types[typeName];
            var displayName = typeName;
            if (typeName === "String" && typeInfo.pattern) {
                displayName = typeName + ":" + typeInfo.pattern;
            }
            
            if (typeInfo.is_sequential === false) {
                problematicCollections.push(res.namespace + ' (' + displayName + ')');
            } else if (typeInfo.is_sequential === true) {
                efficientCollections.push(res.namespace + ' (' + displayName + ')');
            }
        });
    });
    
    printjson(" ");
    printjson('=============================================================');
    printjson('MONGOSYNC PERFORMANCE SUMMARY:');
    if (problematicCollections.length > 0) {
        printjson('⚠️  SLOW MIGRATION EXPECTED for ' + problematicCollections.length + ' collections:');
        var uuidCollections = [];
        problematicCollections.forEach(function(coll) {
            printjson('   - ' + coll);
            if (coll.indexOf('String:UUID') !== -1) {
                uuidCollections.push(coll);
            }
        });
        
        
        printjson(" ");
        printjson('💡 PERFORMANCE OPTIMIZATION OPTION:');
        printjson('   Starting in mongosync 1.16.0, use the "copyInNaturalOrder"');
        printjson('   parameter in the /start API endpoint. This copies data in natural');
        printjson('   sort order which may improve performance for the collection(s) above with');
        printjson('   non-sequential _id values by reducing scattered disk reads.');
        printjson('   Reference: https://www.mongodb.com/docs/mongosync/current/release-notes/1.16/');
    }
    if (efficientCollections.length > 0) {
        printjson('✅ EFFICIENT MIGRATION EXPECTED for ' + efficientCollections.length + ' collections:');
        efficientCollections.forEach(function(coll) {
            printjson('   - ' + coll);
        });
    }
    printjson('=============================================================');
} else {
    printjson('✅ All collections use default ObjectId _ids.');
    printjson('   Expected mongosync performance: EFFICIENT');
}