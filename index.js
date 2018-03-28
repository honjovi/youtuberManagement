'use strict';

const request = require('request');
const async = require('async');
//const AWS = require("aws-sdk");
//const dynamoDB = new AWS.DynamoDB.DocumentClient();

const getNextPage = (channelId, nextPageToken, callback) => {
	const uri = "https://www.googleapis.com/youtube/v3/search?channelId=" + channelId + "&pageToken=" + nextPageToken + "&key=" + process.env.YOUTUBE_API_KEY + "&part=id";

	async.waterfall([
		(next) => {
			request.get({ uri: uri, json: true }, (err, response, body) => {
				if(err){
					console.error(err);
					return;
				}

				let videoIds = [];

				for(let i in body.items){
					if(body.items[i].id.kind != "youtube#video") continue;

					videoIds.push(body.items[i].id.videoId);
				}

				next(null, videoIds, body.nextPageToken);
			});
		},
		(videoIds, nextPageToken, next)=>{
			getVideoViewCount(videoIds, () => {
				next(null, nextPageToken);
			});
		},
		(nextPageToken) => {
			if(nextPageToken){
				getNextPage(channelId, nextPageToken, callback);
				return;
			}

			callback();
		}
	]);

};


const getVideoViewCountSub = (videoId, callback) => {
	const uri = "https://www.googleapis.com/youtube/v3/videos?id=" + videoId + "&key=" + process.env.YOUTUBE_API_KEY + "&part=snippet,statistics";
	request.get({ uri: uri, json: true }, (err, response, body) => {
		if(err){
			console.error(err);
			return;
		}

		console.log(body.items[0].snippet.title, body.items[0].statistics.viewCount);

		callback();
	});
};


const getVideoViewCount = (videoIds, callback) => {
	let funcs = [];

	for(let i in videoIds){
		const videoId = videoIds[i];

		funcs.push((goNextVideo) => {
			getVideoViewCountSub(videoId, goNextVideo);
		});
	}

	funcs.push(() => {
		callback();
	});

	async.series(funcs);
};


exports.handler = (event, context, callback) => {
	/*
	const params = {
		TableName: "Music", // DynamoDBのテーブル名
		Item: {
			"Artist": "GreatArtist",
			"SongTitle": "AwesomeSong",
		}
	}
	*/

	// DynamoDBへのPut処理実行
	/*
	dynamoDB.put(params).promise().then((data) => {
		console.log("Put Success");
		callback(null);
	}).catch((err) => {
		console.log(err);
		callback(err);
	});
	*/

	const channelId = "UClrYrddWLPz-18PyGK_ADPg";

	async.waterfall([
		(next) => {
			const uri = "https://www.googleapis.com/youtube/v3/search?channelId=" + channelId + "&key=" + process.env.YOUTUBE_API_KEY + "&part=id";
			request.get({ uri: uri, json: true }, (err, response, body) => {
				if(err){
					console.error(err);
					return;
				}

				console.log('totalResults: ', body.pageInfo.totalResults);

				let videoIds = [];

				for(let i in body.items){
					if(body.items[i].id.kind != "youtube#video") continue;
					videoIds.push(body.items[i].id.videoId);
				}

				next(null, videoIds, body.nextPageToken);
			});
		},
		(videoIds, nextPageToken, next) => {
			getVideoViewCount(videoIds, () => {
				next(null, nextPageToken);
			});
		},
		(nextPageToken) => {
			getNextPage(channelId, nextPageToken, ()=>{
				callback();
			});
		},
	]);
}
