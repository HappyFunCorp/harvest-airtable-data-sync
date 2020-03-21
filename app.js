require('dotenv').config()

const express = require('express');
const Airtable = require('airtable');
const { Client } = require('pg');

//setup airtable connection
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY,
}).base(process.env.AIRTABLE_BASE_ID);

//setup pg connecting, invisibly using env variables
const client = new Client({
  ssl: {
    rejectUnauthorized: false,
},
});

var fs = require('fs');


client.connect();
var app = express();
app.set('port', process.env.PORT || 4000);

app.listen(4000, function () {
    console.log('Server is running.. on Port 4000');
});


var harvestProjectsData = {};

// Fetch Harvest projects data from postgres...
app.get('/', function (req, res, next) {
      client.query('SELECT hfc_harvest.projects.name AS project_name, hfc_harvest.projects.id AS project_id, hfc_harvest.clients.name AS client_name, hfc_harvest.projects.created_at, ROUND(CAST(SUM(te.total_cost) as numeric),2) AS total_cost, ROUND(CAST (SUM(te.total_billing) as numeric),2) AS total_billing FROM ( SELECT hours*cost_rate AS total_cost, hours*billable_rate AS total_billing, project_id FROM hfc_harvest.time_entries) AS te FULL JOIN hfc_harvest.projects ON projects.id = te.project_id JOIN hfc_harvest.clients ON projects.client_id = clients.id GROUP BY te.project_id, hfc_harvest.projects.name, hfc_harvest.clients.name, hfc_harvest.projects.created_at, hfc_harvest.projects.id ORDER BY hfc_harvest.projects.created_at DESC', function (err, result) {
        if (err) {
            console.log(err);
            res.status(400).send(err);
        }
        res.status(200).send(result.rows);

        //... and store harvest data from PG as object
        var harvestProjectsData = result.rows;
    });
});


app.get('/end-to-end/',function (req, res, next) {

  var harvestProjectsData = {};
  var harvestAirtableLookup = [];

  //to make it easy to see if the project is present in Airtable
  //store just the IDs in an array
  var airtableProjectIdsPresent = [];

  //QUERY POSTGRES FOR HARVEST DATA
  client.query('SELECT hfc_harvest.projects.name AS project_name, hfc_harvest.projects.id AS project_id, hfc_harvest.clients.name AS client_name, hfc_harvest.projects.created_at, ROUND(CAST(SUM(te.total_cost) as numeric),2) AS total_cost, ROUND(CAST (SUM(te.total_billing) as numeric),2) AS total_billing FROM ( SELECT hours*cost_rate AS total_cost, hours*billable_rate AS total_billing, project_id FROM hfc_harvest.time_entries) AS te FULL JOIN hfc_harvest.projects ON projects.id = te.project_id JOIN hfc_harvest.clients ON projects.client_id = clients.id GROUP BY te.project_id, hfc_harvest.projects.name, hfc_harvest.clients.name, hfc_harvest.projects.created_at, hfc_harvest.projects.id ORDER BY hfc_harvest.projects.created_at DESC', function (err, result) {
    if (err) {
        console.log(err);
        res.status(400).send(err);
    }
    res.status(200).send(result.rows);

    //... and store harvest data from PG as object
    harvestProjectsData = result.rows;
    console.log('Successfully stored Harvest Project Data!');


    //----
    //GET AIRTABLE
    //Get all the records already in Airtable and store locally

    console.log('Attempting to fetch Airtable Projects Data');

    base('Projects 2').select({
    view: "Grid view"
    }).eachPage(function page(records, fetchNextPage) {
        // This function (`page`) will get called for each page of records.

        records.forEach(function(record) {
            console.log('Retrieved', record.get('project_id'));
            harvestAirtableLookup.push([
              record.get('project_id').toString(),
              record.getId().toString(),
            ]);
            airtableProjectIdsPresent.push(record.get('project_id').toString());
        });

        // To fetch the next page of records, call `fetchNextPage`.
        // If there are more records, `page` will get called again.
        // If there are no more records, `done` will get called.
        fetchNextPage();

    }, function done(err) {
        if (err) { console.error(err);
          return; } else {
            console.log('Airtable Projects Data Successfully Fetched!');
            console.log('Updating or Creating Records...')

            harvestProjectsData.forEach(function(row){

              // console.log('Looking for existing Airtable entry for project_id: '+row.project_id);

              if (airtableProjectIdsPresent.includes(row.project_id)) {
                console.log('project_id found in Airtable! Attempting to update record...');


                var projectAirtableId = null;

                function lookupAirtableId(arr) {
                  for (var i = 0; i < arr.length; i++) {
                    for (var j = 0; j < arr[i].length; j++) {
                      if (arr[i][j] == row.project_id) {
                        projectAirtableId = arr[i][j+1];
                        console.log('Airtable id found for project!')
                        console.log('project_id: '+row.project_id+', airtable id: '+projectAirtableId);
                      }
                    }
                  }
                }

                lookupAirtableId(harvestAirtableLookup);

                base('Projects 2').update([
                  {
                    "id": projectAirtableId,
                    "fields": {
                      "client_id": row.client_id,
                      "total_cost": parseFloat(row.total_cost),
                      "total_billing": parseFloat(row.total_billing)
                    }
                  }
                ], function(err, records) {
                  if (err) {
                    console.error(err);
                    return;
                  }
                  records.forEach(function(record) {
                    console.log(record.get('project_id'));
                    res.send(record);
                  });
                });

              } else {
                console.log('Project not found in Airtable. Attempting to create new row...');
                base('Projects 2').create([
                  {
                    "fields": {
                      "project_id": row.project_id,
                      "client_id": row.client_id,
                      "Project Name": row.project_name,
                      "total_cost": parseFloat(row.total_cost),
                      "total_billing": parseFloat(row.total_billing)
                    }
                  }
                ], function(err, records) {
                  if (err) {
                    console.error(err);
                    return;
                  }
                  records.forEach(function (record) {
                    console.log('project created in airtable with airtable id '+record.getId());
                  });
                });
              }

            });
          }
    });


  })
});




// //SINGLE ITEM SEARCH IN AIRTABLE
//
// app.get('/airtable-project-lookup/',function (req, res, next) {
//   base('Projects 2').select({
//     filterByFormula: '{project_id} = '+harvestProjectIdLookup,
//   }).eachPage(function(records, fetchNextPage) {
//     records.forEach(function(record) {
//     console.log('Harvest Project ID found in Airtable: '+ harvestProjectIdLookup);
//     //set the Airtable ID of the record you want to update
//     airtableIdProjectToUpdate = record.id;
//     res.send(record);
//     });
//
//   }, function done(error) {
//     console.log('Record not found, or something went wrong');
//     airtableIdProjectToCreate = harvestProjectIdLookup;
//     console.log('Will attempt to create airtable record for Harvest Project ID: '+harvestProjectIdToCreate);
//
//   });
// });
//


app.get('/airtable-project-update',function (req, res, next) {
  base('Projects 2').update([
    {
      "id": airtableIdProjectToUpdate,
      "fields": {
        "total_cost": 10,
        "total_billing": 20
      }
    }
  ], function(err, records) {
    if (err) {
      console.error(err);
      return;
    }
    records.forEach(function(record) {
      console.log(record.get('project_id'));
      res.send(record);
    });
  });
});


//create new project in airtable
app.get('/airtable-project-create',function (req, res, next) {
  base('Projects 2').create([
    testProject
  ], function(err, records) {
    if (err) {
      console.error(err);
      return;
    }
    records.forEach(function (record) {
      console.log('project created in airtable with airtable id '+record.getId());
    });
  });

});
