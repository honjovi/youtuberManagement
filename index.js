'use strict';

const request = require('request');
const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();


const getVideoIdsOnPage = (channelId, pageToken) => {
	let uri = 'https://www.googleapis.com/youtube/v3/search?channelId=' + channelId + '&key=' + process.env.YOUTUBE_API_KEY + '&part=id';

	if(pageToken){
		uri += '&pageToken=' + pageToken;
	}

	return new Promise((resolve) => {
		request.get({ uri: uri, json: true }, (err, response, body) => {
			if(err){
				console.error(err);
				return;
			}

			if(!body){
				console.error('unexpected body ' + body + '.');
			}

			if(!body.items){
				console.error('unexpected items ' + body.items + '.');
			}

			let videoIds = body.items.filter(item => item.id.kind == 'youtube#video').map(item => item.id.videoId);

			resolve({videoIds: videoIds, nextPageToken: body.nextPageToken});
		});
	});
}


const getVideoIds = async (channelId) => {
	let videoIds = [];
	let nextPageToken = null;

	do{
		const pageInfo = await getVideoIdsOnPage(channelId, nextPageToken)
		videoIds = videoIds.concat(pageInfo.videoIds);
		nextPageToken = pageInfo.nextPageToken;
	}while(nextPageToken)

	return new Promise(resolve => {
		resolve(videoIds);
	});
}


const getVideoInfo = videoId => {
	const uri = 'https://www.googleapis.com/youtube/v3/videos?id=' + videoId + '&key=' + process.env.YOUTUBE_API_KEY + '&part=snippet,statistics';
	console.log('get video:', videoId);

	return new Promise(resolve => {
		request.get({ uri: uri, json: true }, (err, response, body) => {
			if(err){
				console.error(err);
				return;
			}

			//const date = new Date();
			const videoInfo = {
				VideoId: videoId,
				PublishedAt: body.items[0].snippet.publishedAt,
				VideoTitle: body.items[0].snippet.title,
				//ChannelId: body.items[0].snippet.channelId,
				ChannelTitle: body.items[0].snippet.channelTitle,
				ViewCount: body.items[0].statistics.viewCount,
				LikeCount: body.items[0].statistics.likeCount | 0,
				DislikeCount: body.items[0].statistics.dislikeCount | 0,
				Thumbnail: '=IMAGE("' + body.items[0].snippet.thumbnails.medium.url + '")'
			};

			resolve(videoInfo);
		});
	});
}


const updateVideoInfo = videoInfo => {
	const params = {
		TableName: 'YoutubeVideo', // DynamoDBのテーブル名
		Key: {
			VideoId: videoInfo.VideoId,
		},
		ExpressionAttributeNames: {
			'#pa': 'PublishedAt',
			'#vt': 'VideoTitle',
			'#ct': 'ChannelTitle',
			'#vc': 'ViewCount',
			'#lc': 'LikeCount',
			'#dc': 'DislikeCount',
			'#th': 'Thumbnail'
		},
		ExpressionAttributeValues: {
			':pa': videoInfo.PublishedAt,
			':vt': videoInfo.VideoTitle,
			':ct': videoInfo.ChannelTitle,
			':vc': videoInfo.ViewCount,
			':lc': videoInfo.LikeCount,
			':dc': videoInfo.DislikeCount,
			':th': videoInfo.Thumbnail
		},
		UpdateExpression: 'set #pa = :pa, #vt = :vt, #ct = :ct, #vc = :vc, #lc = :lc, #dc = :dc, #th = :th',
		Item: videoInfo
	};

	console.log('update: ', videoInfo);

	return new Promise(resolve => {
		dynamoDB.update(params, (err) => {
			if(err){
				console.error(err);
				return;
			}

			resolve();
		});

		/* for debug */
		/* setTimeout(() => {
			console.log('dynamoDB update.')
			resolve();
		}, 50); */
	});
}


const updateChannelRecords = async (channelId) => {
	console.log('search videos:', channelId);

	const videoIds = await getVideoIds(channelId);

	for(let videoId of videoIds){
		const videoInfo = await getVideoInfo(videoId);
		await updateVideoInfo(videoInfo);
	}

	return new Promise(resolve => {
		resolve();
	});
};


const getChannelIds = () => {
	return new Promise(resolve => {
		dynamoDB.scan({TableName : 'Channel'}, function(err, data) {
			if (err){
				console.error(err);
				return;
			}

			const channelIds = [];

			for(let item of data.Items){
				channelIds.push(item.ChannelId);
			}

			resolve(channelIds);
		});

		/* for debug */
		/* setTimeout(() => {
			console.log('dynamoDB update.')
			resolve(['UCsdLjPRxv5yz8EiAdRMQ2KQ', 'UC1ulyJlOkUQjSB3FyFksmhQ']);
		}, 50); */
	});
};


exports.handler = async (event, context, callback) => {
	const channelIds = await getChannelIds();

	const date = new Date();
	const hour = date.getHours();
	const minute = date.getMinutes();

	for(let i in channelIds){
		if(i % 36 != (hour * 6 + parseInt(minute / 10)) % 36) continue;
		await updateChannelRecords(channelIds[i], null);
	}

	callback();
}
