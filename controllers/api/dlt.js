const getPointsWithStatistics = async (req, res) => {
  try {
    const today = stripTime(new Date());

    const pointsWithStats = await Point.aggregate([
      // 1. Join with Users who are not deleted
      {
        $lookup: {
          from: 'users',
          let: { pointId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$point', '$$pointId'] },
                    { $eq: ['$isDeleted', false] },
                  ],
                },
              },
            },
            // Project necessary fields
            {
              $project: {
                _id: 1,
                name: 1,
                phone: 1,
                email: 1,
                orders: 1,
              },
            },
          ],
          as: 'users',
        },
      },
      // 2. Unwind users
      { $unwind: '$users' },
      // 3. Lookup latest order for each user
      {
        $lookup: {
          from: 'orders',
          let: { userId: '$users._id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$userId', '$$userId'] },
              },
            },
            { $sort: { orderEnd: -1 } }, // Get the latest order by date
            { $limit: 1 },
            // Project only the needed fields
            {
              $project: {
                _id: 1,
                orderStart: 1,
                orderEnd: 1,
                status: 1,
                isVeg: 1,
                plan: 1,
                leave: 1,
              },
            },
          ],
          as: 'latestOrder',
        },
      },
      // 4. Add latestOrder to users
      {
        $addFields: {
          'users.latestOrder': { $arrayElemAt: ['$latestOrder', 0] },
        },
      },
      // 5. Add per-user flags
      {
        $addFields: {
          'users.isActiveToday': {
            $and: [
              { $ne: ['$users.latestOrder', null] },
              { $eq: ['$users.latestOrder.status', 'active'] },
              { $lte: ['$users.latestOrder.orderStart', today] },
              { $gte: ['$users.latestOrder.orderEnd', today] },
            ],
          },
          'users.isOnLeaveToday': {
            $and: [
              { $ne: ['$users.latestOrder', null] },
              {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: { $ifNull: ['$users.latestOrder.leave', []] },
                        as: 'leave',
                        cond: {
                          $and: [
                            { $lte: ['$$leave.start', today] },
                            { $gte: ['$$leave.end', today] },
                          ],
                        },
                      },
                    },
                  },
                  0,
                ],
              },
            ],
          },
          'users.hasMeal': {
            B: { $in: ['B', { $ifNull: ['$users.latestOrder.plan', []] }] },
            L: { $in: ['L', { $ifNull: ['$users.latestOrder.plan', []] }] },
            D: { $in: ['D', { $ifNull: ['$users.latestOrder.plan', []] }] },
          },
          'users.isVegActiveToday': {
            $and: [
              { $eq: ['$users.latestOrder.isVeg', true] },
              { $eq: ['$users.isActiveToday', true] },
              { $ne: ['$users.isOnLeaveToday', true] },
            ],
          },
          'users.isVegUser': { $eq: ['$users.latestOrder.isVeg', true] },
        },
      },
      // 6. Group by point and calculate sums
      {
        $group: {
          _id: '$_id',
          place: { $first: '$place' },
          mode: { $first: '$mode' },
          totalCustomers: { $sum: 1 },
          totalExpired: {
            $sum: { $cond: ['$users.isExpired', 1, 0] },
          },
          todaysActiveCustomers: {
            $sum: { $cond: ['$users.isActiveToday', 1, 0] },
          },
          todaysLeave: {
            $sum: { $cond: ['$users.isOnLeaveToday', 1, 0] },
          },
          totalBreakfast: {
            $sum: { $cond: ['$users.hasMeal.B', 1, 0] },
          },
          totalLunch: {
            $sum: { $cond: ['$users.hasMeal.L', 1, 0] },
          },
          totalDinner: {
            $sum: { $cond: ['$users.hasMeal.D', 1, 0] },
          },
          totalVegNeededToday: {
            $sum: { $cond: ['$users.isVegActiveToday', 1, 0] },
          },
          totalVeg: {
            $sum: { $cond: ['$users.isVegUser', 1, 0] },
          },
        },
      },
      // 7. Sort points by totalCustomers
      {
        $sort: { totalCustomers: -1, place: 1 },
      },
      // 8. Project required fields
      {
        $project: {
          place: 1,
          mode: 1,
          totalCustomers: 1,
          totalExpired: 1,
          todaysActiveCustomers: 1,
          todaysLeave: 1,
          totalBreakfast: 1,
          totalLunch: 1,
          totalDinner: 1,
          totalVegNeededToday: 1,
          totalVeg: 1,
        },
      },
    ]);

    res.status(200).json(pointsWithStats);
  } catch (error) {
    console.error('Error fetching points with statistics:', error);
    res.status(500).json({ message: 'Failed to fetch points with statistics' });
  }
};
