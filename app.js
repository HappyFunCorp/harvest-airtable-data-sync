require('dotenv').config()

const express = require('express');
const Airtable = require('airtable');
const { Client } = require('pg');
var async = require("async");

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


// harvest data from postgres
var harvestProjectsData = {};

var airtableUpdates = [];
var airtableUpdatesChunked = [];

var airtableCreates = [];
var airtableCreatesChunked = [];

// lookup table via nested arrays with Harvest IDs and Airtable IDs
var harvestAirtableLookup = [];

//to make it easy to see if the project is present in Airtable
//store just the IDs in an array
var airtableProjectIdsPresent = [];


// async.waterfall([
//   harvestDataRefresh,
//   updateAirtableRecords
// ], function(err, result) {
//   // result now equals 'Task1 and Task2 completed'
//   console.log(result);
// });


harvestDataRefresh();
setTimeout(updateAirtableRecords,10000);
setTimeout(createAirtableRecords,20000);


// Fetch Harvest projects data from postgres...
app.get('/', function (req, res, next) {
      client.query('SELECT hfc_harvest.projects.name AS project_name, hfc_harvest.projects.id AS project_id, hfc_harvest.clients.name AS client_name, hfc_harvest.clients.id AS client_id, hfc_harvest.projects.created_at, ROUND(CAST(SUM(te.total_cost) as numeric),2) AS total_cost, ROUND(CAST (SUM(te.total_billing) as numeric),2) AS total_billing FROM ( SELECT hours*cost_rate AS total_cost, hours*billable_rate AS total_billing, project_id FROM hfc_harvest.time_entries) AS te FULL JOIN hfc_harvest.projects ON projects.id = te.project_id JOIN hfc_harvest.clients ON projects.client_id = clients.id GROUP BY te.project_id, hfc_harvest.projects.name, hfc_harvest.clients.name, hfc_harvest.projects.created_at, hfc_harvest.projects.id, hfc_harvest.clients.id ORDER BY hfc_harvest.projects.created_at DESC', function (err, result) {
        if (err) {
            console.log(err);
            res.status(400).send(err);
        }
        res.status(200).send(result.rows);

        //... and store harvest data from PG as object
        var harvestProjectsData = result.rows;
    });
});


function harvestDataRefresh() {

  //QUERY POSTGRES FOR HARVEST DATA
  client.query('SELECT hfc_harvest.projects.name AS project_name, hfc_harvest.projects.id AS project_id, hfc_harvest.clients.name AS client_name, hfc_harvest.clients.id AS client_id, hfc_harvest.projects.created_at, ROUND(CAST(SUM(te.total_cost) as numeric),2) AS total_cost, ROUND(CAST (SUM(te.total_billing) as numeric),2) AS total_billing FROM ( SELECT hours*cost_rate AS total_cost, hours*billable_rate AS total_billing, project_id FROM hfc_harvest.time_entries) AS te FULL JOIN hfc_harvest.projects ON projects.id = te.project_id JOIN hfc_harvest.clients ON projects.client_id = clients.id GROUP BY te.project_id, hfc_harvest.projects.name, hfc_harvest.clients.name, hfc_harvest.projects.created_at, hfc_harvest.projects.id, hfc_harvest.clients.id ORDER BY hfc_harvest.projects.created_at DESC', function (err, result) {
    if (err) {
        console.log(err);
    }

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
                console.log('project_id found in Airtable! Adding to update list');

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
                  } airtableUpdates.push({
                    "id": projectAirtableId,
                    "fields": {
                      "client_id": String(row.client_id),
                      "total_cost": parseFloat(row.total_cost),
                      "total_billing": parseFloat(row.total_billing)
                    }
                  });
                  return
                }

                lookupAirtableId(harvestAirtableLookup);


              } else {
                console.log('Project not found in Airtable. Adding to create list.');
                airtableCreates.push({
                  "fields": {
                    "project_id": String(row.project_id),
                    "client_id": String(row.client_id),
                    "Project Name": row.project_name,
                    "total_cost": parseFloat(row.total_cost),
                    "total_billing": parseFloat(row.total_billing)
                  }
                })
              }

            });

          }
    });
  })
};

function updateAirtableRecords(){
  console.log('Initiating Airtable Updates for '+airtableUpdates.length+ ' records...');

  console.log('Preparing to chunk array for Updated Airtable Records');
  var size = 10;
  for (var i=0; i<airtableUpdates.length; i+=size) {

       airtableUpdatesChunked.push(airtableUpdates.slice(i,i+size));
  }
  console.log('Chunked array created with '+airtableUpdatesChunked.length+' chunks.');

  for (var i=0; i<airtableUpdatesChunked.length; i++) {
    console.log('Preparing to update records for chunk '+ i+1 +' of '+airtableUpdatesChunked.length);

    base('Projects 2').update(airtableUpdatesChunked[i], function(err, records) {
      if (err) {
        console.error(err);
        return;
      }
      records.forEach(function(record) {
        console.log(record.get('project_id'));
      });
    });


  }

};

function createAirtableRecords() {
  console.log('Initiating Creation of new Airtable Records for '+airtableCreates.length+ ' projects...');

  console.log('Preparing to chunk array for new Airtable Records');
  var size = 10;
  for (var i=0; i<airtableCreates.length; i+=size) {

       airtableCreatesChunked.push(airtableCreates.slice(i,i+size));
  }
  console.log('Chunked array created with '+airtableCreatesChunked.length+' chunks.');


  for (var i=0; i<airtableCreatesChunked.length; i++) {
    console.log('Preparing to post new record for chunk '+ i+1 +' of '+airtableCreatesChunked.length);
    base('Projects 2').create(airtableCreatesChunked[i], function(err, records) {
      if (err) {
        console.error(err);
        return;
      }
      records.forEach(function (record) {
        console.log('project created in airtable with airtable id '+record.getId());
      });
    });
  }
};
