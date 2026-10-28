"""Seven reviewed grasp objectives; geometry terms are shared, task terms are not.

Residuals use metres and radians. Each named function specifies digit landing
regions and coordination for one native hand/object pair. The solver optimizes
native joint angles and wrist translation, with the required palm orientation
fixed by construction. No object dimensions are decision variables.
"""
import numpy as np

def xhand_duck(c):
    # Thumb on the upper near flank, four fingers cupping the front belly.
    targets = [[-.022,.037,-.012],[.022,.038,-.027],[.042,.005,-.037],[.034,-.027,-.032],[.012,-.042,-.022]]
    q=c.q
    return np.r_[c.geometry(targets, [1.3,1,1.2,1,.7]),
                 .55*np.diff(q[[4,6,8,10]]), .30*(q[[5,7,9,11]]-1.4*q[[4,6,8,10]]),
                 .4*q[3], .12*(q-c.prior)]

def allegro_duck(c):
    # Splay the three long fingers around the body, oppose with the short thumb.
    targets = [[-.025,.022,.002],[.018,.040,-.024],[.044,0,-.036],[.018,-.040,-.024]]
    q=c.q
    return np.r_[c.geometry(targets,[1.5,1,1.3,1]), .50*np.diff(q[[1,5,9]]),
                 .22*(q[[3,7,11]]-.8*q[[2,6,10]]), .12*(q-c.prior)]

def shadow_duck(c):
    # Broad four-finger basket with a distinct thumb opposition constraint.
    targets = [[-.025,.035,-.010],[.021,.037,-.027],[.041,.012,-.035],[.036,-.021,-.032],[.017,-.039,-.021]]
    q=c.q
    return np.r_[c.geometry(targets,[1.4,1,1.2,1,.7]), .4*q[0],
                 .32*(q[[4,8,12,17]]-.75*q[[3,7,11,16]]),
                 .50*np.diff(q[[2,6,10,15]]), .15*q[[1,5,9,14]], .12*(q-c.prior)]

def xhand_apple(c):
    # Thumb opposes the four fingertips across the apple's equator.
    targets = [[.029,-.018,.002],[-.022,-.028,-.002],[-.036,-.006,-.003],[-.031,.018,-.001],[-.017,.032,.004]]
    q=c.q
    return np.r_[c.geometry(targets,[1.5,1,1.2,1,.7]), .25*np.diff(q[[4,6,8,10]]),
                 .2*(q[[5,7,9,11]]-.85*q[[4,6,8,10]]), .25*q[3], .13*(q-c.prior)]

def allegro_apple(c):
    # Three fingertips form a broad tripod opposite the thumb, below the stem.
    targets = [[.034,-.010,0],[-.017,-.033,.001],[-.037,0,-.003],[-.017,.033,.001]]
    q=c.q
    return np.r_[c.geometry(targets,[1.5,1,1.3,1]), .26*(q[1]-q[9]),
                 .24*(q[2]-q[10]), .22*(q[[3,7,11]]-.8*q[[2,6,10]]), .13*(q-c.prior)]

def shadow_apple(c):
    # Thumb and index oppose; the remaining fingers surround the lower shoulder.
    targets = [[.029,-.020,.002],[-.019,-.031,.001],[-.035,-.011,-.002],[-.033,.014,0],[-.019,.030,.006]]
    q=c.q
    return np.r_[c.geometry(targets,[1.5,1.2,1.1,1,.7]), .5*q[0],
                 .35*(q[[4,8,12,17]]-.7*q[[3,7,11,16]]),
                 .22*np.diff(q[[2,6,10,15]]), .15*q[[1,5,9,14]], .13*(q-c.prior)]

def shadow_bottle(c):
    # A cylindrical power wrap: staggered fingers on the body, thumb opposite.
    targets = [[.005,.028,.016],[-.012,-.026,.028],[-.014,-.026,.009],[-.014,-.026,-.011],[-.012,-.026,-.029]]
    q=c.q
    return np.r_[c.geometry(targets,[1.7,1.1,1.2,1,.9]), c.bottle_opposition(), .5*q[0],
                 .55*(q[[4,8,12,17]]-.8*q[[3,7,11,16]]),
                 1.2*np.diff(q[[2,6,10,15]]), .8*np.diff(q[[3,7,11,16]]),
                 .6*np.diff(q[[4,8,12,17]]), .3*q[[1,5,9,14]], .14*(q-c.prior)]

OBJECTIVES = {
    ('xhand','duck'): xhand_duck, ('allegro','duck'): allegro_duck,
    ('shadow','duck'): shadow_duck, ('xhand','apple'): xhand_apple,
    ('allegro','apple'): allegro_apple, ('shadow','apple'): shadow_apple,
    ('shadow','bottle'): shadow_bottle,
}
